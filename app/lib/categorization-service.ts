import { db, categoryMatchings, anonymizedMerchants, categories, transactions } from '~/db';
import { eq, and, sql, desc } from 'drizzle-orm';
import OpenAI from 'openai';
import crypto from 'crypto';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
      const embeddingStr = `[${embedding.join(',')}]`;
      const similar = await db.execute(sql`
        SELECT
          merchant_hash,
          category_name,
          confidence,
          usage_count,
          1 - (embedding <=> ${embeddingStr}::vector) as similarity
        FROM anonymized_merchants
        WHERE 1 - (embedding <=> ${embeddingStr}::vector) > 0.75
        ORDER BY similarity DESC
        LIMIT 5
      `);

      if (similar.rows && similar.rows.length > 0) {
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

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a financial transaction categorizer. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 100,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const result = JSON.parse(content.trim());

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
          embedding: embeddingResponse.data[0].embedding as any, // pgvector will handle the array
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

  // Batch AI suggestion for multiple transactions
  static async batchAISuggest(userId: string, limit: number = 20) {
    try {
      // Get uncategorized transactions (excluding hidden ones)
      const uncategorized = await db
        .select()
        .from(transactions)
        .where(and(
          eq(transactions.userId, userId),
          sql`category_id IS NULL`,
          eq(transactions.isHidden, false)
        ))
        .orderBy(desc(transactions.date))
        .limit(limit);

      if (uncategorized.length === 0) {
        return {
          suggestions: [],
          newCategoryRecommendations: [],
          message: 'No uncategorized transactions found',
        };
      }

      // Get user's existing categories
      const userCategories = await db
        .select()
        .from(categories)
        .where(eq(categories.userId, userId));

      const suggestions = [];
      const needsLLM = []; // Transactions that need LLM fallback

      // Phase 1: Try rule-based and vector matching for each transaction
      for (const txn of uncategorized) {
        const transactionData: TransactionData = {
          name: txn.name,
          merchantName: txn.merchantName,
          amount: txn.amount,
          plaidCategory: txn.plaidCategory,
        };

        // Try rule-based first
        const ruleResult = await this.tryRuleBasedMatch(userId, transactionData);
        if (ruleResult && ruleResult.confidence >= 0.85) {
          suggestions.push({
            transactionId: txn.id,
            transactionName: txn.merchantName || txn.name,
            amount: txn.amount,
            date: txn.date,
            suggestedCategory: ruleResult.categoryName,
            isNewCategory: false,
            confidence: ruleResult.confidence,
            method: 'rule',
            reasoning: 'Matched from your previous categorizations',
          });
          continue;
        }

        // Try vector matching against anonymized data
        const vectorResult = await this.tryVectorMatch(userId, transactionData);
        if (vectorResult && vectorResult.confidence >= 0.75) {
          suggestions.push({
            transactionId: txn.id,
            transactionName: txn.merchantName || txn.name,
            amount: txn.amount,
            date: txn.date,
            suggestedCategory: vectorResult.categoryName,
            isNewCategory: false,
            confidence: vectorResult.confidence,
            method: 'vector',
            reasoning: 'Similar to merchants categorized by other users',
          });
          continue;
        }

        // If no high-confidence match, add to LLM queue
        needsLLM.push(txn);
      }

      // Phase 2: Use LLM for remaining transactions
      if (needsLLM.length > 0 && userCategories.length > 0) {
        const categoryList = userCategories.map((c) => c.name).join(', ');
        const transactionsList = needsLLM
          .map(
            (txn, idx) =>
              `${idx + 1}. ID: ${txn.id}, Name: "${txn.name}", Merchant: "${txn.merchantName || 'N/A'}", Amount: $${txn.amount}, Date: ${txn.date}`
          )
          .join('\n');

        const systemPrompt = `You are an intelligent financial categorization assistant.

User's existing categories: ${categoryList}

Analyze each transaction and suggest the best category. If multiple transactions would benefit from a NEW category that doesn't exist yet, recommend it at the end.

Response format - use pipe-delimited rows (easy to parse):
For each transaction, output ONE line in this format:
TXN|transaction_id|suggested_category|confidence|reasoning

For new category recommendations, output lines like:
NEW|category_name|reason|suggested_color|count

Rules:
- suggested_category must match an existing category name EXACTLY, or be "UNCATEGORIZED"
- confidence is 0-100
- reasoning is one short phrase (no pipes, no newlines)
- For NEW categories, use #hexcode for color
- Keep reasoning brief and simple`;

        const userPrompt = `Categorize these ${needsLLM.length} transactions:

${transactionsList}

Output format: TXN|id|category|confidence|reason
Then if needed: NEW|name|reason|color|count`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 4000,
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          // Parse the pipe-delimited response
          const lines = content.trim().split('\n');
          const newCategoryRecommendations = [];

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

            const parts = trimmed.split('|');

            if (parts[0] === 'TXN' && parts.length >= 5) {
              const [_, transactionId, suggestedCategory, confidenceStr, ...reasoningParts] = parts;
              const txn = needsLLM.find((t) => t.id === transactionId);

              if (txn) {
                const isNewCategory =
                  suggestedCategory !== 'UNCATEGORIZED' &&
                  !userCategories.some((c) => c.name.toLowerCase() === suggestedCategory.toLowerCase());

                suggestions.push({
                  transactionId,
                  transactionName: txn.merchantName || txn.name,
                  amount: txn.amount,
                  date: txn.date,
                  suggestedCategory: suggestedCategory === 'UNCATEGORIZED' ? null : suggestedCategory,
                  isNewCategory,
                  confidence: parseInt(confidenceStr) / 100,
                  method: 'llm',
                  reasoning: reasoningParts.join('|'), // rejoin in case reasoning had pipes
                });
              }
            } else if (parts[0] === 'NEW' && parts.length >= 5) {
              const [_, name, reason, color, countStr] = parts;
              newCategoryRecommendations.push({
                name,
                reason,
                suggestedColor: color,
                transactionCount: parseInt(countStr) || 1,
              });
            }
          }

          return {
            suggestions,
            newCategoryRecommendations,
            totalTransactions: uncategorized.length,
            stats: {
              rule: suggestions.filter((s) => s.method === 'rule').length,
              vector: suggestions.filter((s) => s.method === 'vector').length,
              llm: suggestions.filter((s) => s.method === 'llm').length,
            },
          };
        }
      }

      // Return what we have (even if LLM phase didn't run)
      return {
        suggestions,
        newCategoryRecommendations: [],
        totalTransactions: uncategorized.length,
        stats: {
          rule: suggestions.filter((s) => s.method === 'rule').length,
          vector: suggestions.filter((s) => s.method === 'vector').length,
          llm: 0,
        },
      };
    } catch (error) {
      console.error('Error in batch AI suggest:', error);
      throw error;
    }
  }
}
