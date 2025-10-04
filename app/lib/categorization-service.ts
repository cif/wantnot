import { db, categoryMatchings, anonymizedMerchants, categories, transactions } from '~/db';
import { eq, and, sql, desc } from 'drizzle-orm';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface TransactionData {
  name: string;
  merchantName?: string | null;
  amount: string;
  plaidCategory?: string[] | null;
}

export interface CategorizationResult {
  categoryId: string | null;
  categoryName: string | null;
  method: 'rule' | 'vector' | 'llm' | null;
  confidence: number;
}

export class CategorizationService {
  // Normalize merchant name for consistent matching
  private static normalizeMerchant(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '') // remove special chars
      .replace(/\s+/g, ' ') // normalize whitespace
      .slice(0, 100); // limit length
  }

  // Generate SHA-256 hash for privacy
  private static hashMerchant(name: string): string {
    return crypto.createHash('sha256').update(name).digest('hex');
  }

  // TIER 1: Rule-based matching (instant, free)
  private static async tryRuleBasedMatch(
    userId: string,
    transaction: TransactionData
  ): Promise<CategorizationResult | null> {
    const merchantName = transaction.merchantName || transaction.name;
    const normalized = this.normalizeMerchant(merchantName);

    // Try exact match from user's history
    const match = await db
      .select()
      .from(categoryMatchings)
      .where(
        and(
          eq(categoryMatchings.userId, userId),
          eq(categoryMatchings.merchantPattern, normalized)
        )
      )
      .orderBy(desc(categoryMatchings.confidence))
      .limit(1);

    if (match.length > 0) {
      const category = await db
        .select()
        .from(categories)
        .where(eq(categories.id, match[0].categoryId))
        .limit(1);

      if (category.length > 0) {
        return {
          categoryId: category[0].id,
          categoryName: category[0].name,
          method: 'rule',
          confidence: match[0].confidence,
        };
      }
    }

    return null;
  }

  // TIER 2: Vector similarity search (fast, cost-effective)
  private static async tryVectorMatch(
    userId: string,
    transaction: TransactionData
  ): Promise<CategorizationResult | null> {
    try {
      const merchantName = transaction.merchantName || transaction.name;
      const normalized = this.normalizeMerchant(merchantName);
      const hash = this.hashMerchant(normalized);

      // Check if we already have this merchant in anonymized DB
      const existing = await db
        .select()
        .from(anonymizedMerchants)
        .where(eq(anonymizedMerchants.merchantHash, hash))
        .limit(1);

      let embedding: number[];

      if (existing.length > 0) {
        // Use existing embedding
        embedding = existing[0].embedding as number[];
      } else {
        // Generate new embedding
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: normalized,
        });
        embedding = embeddingResponse.data[0].embedding;
      }

      // Find similar merchants using vector similarity
      // Note: Using SQL template for pgvector cosine similarity
      const similar = await db.execute(sql`
        SELECT
          merchant_hash,
          category_name,
          confidence,
          usage_count,
          1 - (embedding <=> ${JSON.stringify(embedding)}::vector) as similarity
        FROM anonymized_merchants
        WHERE 1 - (embedding <=> ${JSON.stringify(embedding)}::vector) > 0.75
        ORDER BY similarity DESC
        LIMIT 5
      `);

      if (similar.rows.length > 0) {
        // Get the best match
        const bestMatch = similar.rows[0] as {
          category_name: string;
          confidence: number;
          similarity: number;
        };

        // Find user's category with matching name
        const userCategories = await db
          .select()
          .from(categories)
          .where(eq(categories.userId, userId));

        const matchingCategory = userCategories.find(
          (cat) => cat.name.toLowerCase() === bestMatch.category_name.toLowerCase()
        );

        if (matchingCategory) {
          return {
            categoryId: matchingCategory.id,
            categoryName: matchingCategory.name,
            method: 'vector',
            confidence: Number(bestMatch.similarity),
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Error in vector matching:', error);
      return null;
    }
  }

  // TIER 3: LLM fallback (slower, more expensive, but highly accurate)
  private static async tryLLMMatch(
    userId: string,
    transaction: TransactionData
  ): Promise<CategorizationResult | null> {
    try {
      // Get user's categories
      const userCategories = await db
        .select()
        .from(categories)
        .where(eq(categories.userId, userId));

      if (userCategories.length === 0) {
        return null;
      }

      const categoryNames = userCategories.map((c) => c.name).join(', ');

      const prompt = `You are a financial transaction categorizer. Given a transaction, suggest the most appropriate category from the user's list.

Transaction details:
- Name: ${transaction.name}
- Merchant: ${transaction.merchantName || 'N/A'}
- Amount: $${transaction.amount}
- Plaid Category: ${transaction.plaidCategory?.join(' > ') || 'N/A'}

User's categories: ${categoryNames}

Respond with ONLY a JSON object in this exact format:
{"category": "category_name", "confidence": 0.95}

If no category is appropriate, respond with:
{"category": null, "confidence": 0}`;

      const response = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const result = JSON.parse(content.text.trim());

        if (result.category) {
          const matchingCategory = userCategories.find(
            (c) => c.name.toLowerCase() === result.category.toLowerCase()
          );

          if (matchingCategory) {
            return {
              categoryId: matchingCategory.id,
              categoryName: matchingCategory.name,
              method: 'llm',
              confidence: result.confidence,
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error in LLM matching:', error);
      return null;
    }
  }

  // Main categorization method - tries all tiers in order
  static async categorizeTransaction(
    userId: string,
    transaction: TransactionData
  ): Promise<CategorizationResult> {
    // Tier 1: Rule-based
    const ruleResult = await this.tryRuleBasedMatch(userId, transaction);
    if (ruleResult && ruleResult.confidence >= 0.9) {
      return ruleResult;
    }

    // Tier 2: Vector similarity
    const vectorResult = await this.tryVectorMatch(userId, transaction);
    if (vectorResult && vectorResult.confidence >= 0.75) {
      return vectorResult;
    }

    // Tier 3: LLM fallback (only if vectors failed)
    const llmResult = await this.tryLLMMatch(userId, transaction);
    if (llmResult && llmResult.confidence >= 0.7) {
      return llmResult;
    }

    // Return best result even if confidence is low, or null
    const bestResult = [ruleResult, vectorResult, llmResult]
      .filter(Boolean)
      .sort((a, b) => (b?.confidence || 0) - (a?.confidence || 0))[0];

    return (
      bestResult || {
        categoryId: null,
        categoryName: null,
        method: null,
        confidence: 0,
      }
    );
  }

  // Learn from manual categorization
  static async learnFromCategorization(
    userId: string,
    transaction: TransactionData,
    categoryId: string,
    contributToAnonymized: boolean = true
  ) {
    const merchantName = transaction.merchantName || transaction.name;
    const normalized = this.normalizeMerchant(merchantName);

    // Update or create user-specific rule
    const existing = await db
      .select()
      .from(categoryMatchings)
      .where(
        and(
          eq(categoryMatchings.userId, userId),
          eq(categoryMatchings.merchantPattern, normalized)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Increment confidence and match count
      await db
        .update(categoryMatchings)
        .set({
          categoryId,
          confidence: Math.min(1.0, existing[0].confidence + 0.1),
          matchCount: existing[0].matchCount + 1,
          lastMatched: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(categoryMatchings.id, existing[0].id));
    } else {
      // Create new rule
      await db.insert(categoryMatchings).values({
        userId,
        categoryId,
        merchantPattern: normalized,
        confidence: 0.8,
        matchCount: 1,
        lastMatched: new Date(),
      });
    }

    // Contribute to anonymized database (opt-in)
    if (contributToAnonymized) {
      await this.contributeToAnonymizedDB(userId, normalized, categoryId);
    }
  }

  // Contribute to anonymized vector database (privacy-preserving)
  private static async contributeToAnonymizedDB(
    userId: string,
    normalizedMerchant: string,
    categoryId: string
  ) {
    try {
      const hash = this.hashMerchant(normalizedMerchant);

      // Get category name
      const category = await db
        .select()
        .from(categories)
        .where(eq(categories.id, categoryId))
        .limit(1);

      if (category.length === 0) return;

      const categoryName = category[0].name.toLowerCase();

      // Check if already exists
      const existing = await db
        .select()
        .from(anonymizedMerchants)
        .where(eq(anonymizedMerchants.merchantHash, hash))
        .limit(1);

      if (existing.length > 0) {
        // Update existing entry
        await db
          .update(anonymizedMerchants)
          .set({
            usageCount: existing[0].usageCount + 1,
            confidence: Math.min(1.0, existing[0].confidence + 0.05),
            lastUpdated: new Date(),
          })
          .where(eq(anonymizedMerchants.id, existing[0].id));
      } else {
        // Generate embedding and create new entry
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: normalizedMerchant,
        });

        await db.insert(anonymizedMerchants).values({
          merchantHash: hash,
          embedding: JSON.stringify(embeddingResponse.data[0].embedding),
          categoryName,
          confidence: 0.8,
          usageCount: 1,
          lastUpdated: new Date(),
        });
      }
    } catch (error) {
      console.error('Error contributing to anonymized DB:', error);
      // Don't throw - this is optional
    }
  }
}
