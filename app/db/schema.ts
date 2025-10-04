import { pgTable, text, timestamp, decimal, boolean, integer, uuid, vector, real, index } from 'drizzle-orm/pg-core';

// Users table - links Firebase UID to database records
export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  firebaseUid: text('firebase_uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Connected bank accounts from Plaid
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: uuid('user_id').references(() => users.id).notNull(),
  plaidAccountId: text('plaid_account_id').notNull().unique(),
  plaidItemId: text('plaid_item_id').notNull(),
  accessToken: text('access_token').notNull(),
  name: text('name').notNull(),
  officialName: text('official_name'),
  type: text('type').notNull(), // checking, savings, credit, etc.
  subtype: text('subtype'),
  mask: text('mask'), // last 4 digits
  currentBalance: decimal('current_balance', { precision: 12, scale: 2 }),
  availableBalance: decimal('available_balance', { precision: 12, scale: 2 }),
  isoCurrencyCode: text('iso_currency_code').default('USD'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Budget categories for transaction classification
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: uuid('user_id').references(() => users.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').default('#6B7280'), // hex color code
  budgetLimit: decimal('budget_limit', { precision: 12, scale: 2 }),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Transactions from Plaid
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: uuid('user_id').references(() => users.id).notNull(),
  accountId: uuid('account_id').references(() => accounts.id).notNull(),
  categoryId: uuid('category_id').references(() => categories.id),
  plaidTransactionId: text('plaid_transaction_id').notNull().unique(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  isoCurrencyCode: text('iso_currency_code').default('USD'),
  name: text('name').notNull(),
  merchantName: text('merchant_name'),
  date: timestamp('date').notNull(),
  authorizedDate: timestamp('authorized_date'),
  accountOwner: text('account_owner'),
  pending: boolean('pending').default(false).notNull(),
  // Plaid category information
  plaidCategory: text('plaid_category').array(),
  plaidCategoryId: text('plaid_category_id'),
  // User notes and custom fields
  notes: text('notes'),
  isHidden: boolean('is_hidden').default(false).notNull(),
  // Auto-categorization metadata
  autoCategorizationMethod: text('auto_categorization_method'), // 'rule' | 'vector' | 'llm' | 'manual' | null
  autoCategorizationConfidence: real('auto_categorization_confidence'), // 0.0 - 1.0
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User-specific category matching rules (learned from manual categorizations)
export const categoryMatchings = pgTable('category_matchings', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: uuid('user_id').references(() => users.id).notNull(),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
  merchantPattern: text('merchant_pattern').notNull(), // normalized merchant name or pattern
  confidence: real('confidence').default(1.0).notNull(), // increases with repeated matches
  matchCount: integer('match_count').default(1).notNull(), // how many times this rule has matched
  lastMatched: timestamp('last_matched'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Anonymized merchant embeddings for cross-user learning (privacy-preserving)
export const anonymizedMerchants = pgTable('anonymized_merchants', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantHash: text('merchant_hash').notNull().unique(), // SHA-256 hash of normalized merchant name
  embedding: vector('embedding', { dimensions: 1536 }), // OpenAI text-embedding-3-small dimensions
  categoryName: text('category_name').notNull(), // anonymized category name (not user-specific)
  confidence: real('confidence').default(1.0).notNull(),
  usageCount: integer('usage_count').default(1).notNull(), // how many users contributed
  lastUpdated: timestamp('last_updated').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  embeddingIdx: index('anonymized_merchants_embedding_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

// Plaid webhook events tracking
export const plaidWebhooks = pgTable('plaid_webhooks', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: uuid('user_id').references(() => users.id),
  itemId: text('item_id').notNull(),
  webhookType: text('webhook_type').notNull(),
  webhookCode: text('webhook_code').notNull(),
  error: text('error'),
  newTransactions: integer('new_transactions'),
  removedTransactions: text('removed_transactions').array(),
  processed: boolean('processed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});