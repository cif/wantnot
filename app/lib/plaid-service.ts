import { and, eq } from 'drizzle-orm';
import { plaidClient } from './plaid';
import { db, accounts, transactions } from '~/db';
import { CountryCode, Products } from 'plaid';
import { CategorizationService } from './categorization-service';

export interface CreateAccountParams {
  userId: string;
  plaidAccountId: string;
  plaidItemId: string;
  accessToken: string;
  name: string;
  officialName?: string;
  type: string;
  subtype?: string;
  mask?: string;
  currentBalance?: string;
  availableBalance?: string;
  isoCurrencyCode?: string;
}

// Plaid error codes that mean the user has to re-authenticate via Link update mode
const RECONNECT_ERROR_CODES = new Set([
  'ITEM_LOGIN_REQUIRED',
  'PENDING_EXPIRATION',
  'PENDING_DISCONNECT',
  'USER_PERMISSION_REVOKED',
  'ACCESS_NOT_GRANTED',
]);

// Pull Plaid's error_code/error_message out of an axios error, if present
export function getPlaidError(error: unknown): { code: string | null; message: string | null } {
  const data = (error as any)?.response?.data;
  return {
    code: typeof data?.error_code === 'string' ? data.error_code : null,
    message: typeof data?.error_message === 'string' ? data.error_message : null,
  };
}

// Error thrown by sync/refresh operations that preserves Plaid's error code
export class PlaidSyncError extends Error {
  code: string | null;
  plaidMessage: string | null;
  needsReconnect: boolean;

  constructor(context: string, cause: unknown) {
    const { code, message } = getPlaidError(cause);
    super(code ? `${context}: ${code}` : context);
    this.name = 'PlaidSyncError';
    this.code = code;
    this.plaidMessage = message;
    this.needsReconnect = code !== null && RECONNECT_ERROR_CODES.has(code);
  }
}

// Bank-internal movements (credit card payments, loan payments) are hidden at sync time so they
// never count as spending. Matches Bank of America's naming on both sides of a payment.
const INTERNAL_PAYMENT_PATTERNS = [
  /payment to CRD \d{4}/i,          // checking side: "Online Banking payment to CRD 3757"
  /payment to CFG \d{4}/i,          // checking side: loan payment
  /^PAYMENT FROM CHK \d{4}/i,       // card side
  /^PAYMENT TO ACCT #\d{4}/i,       // checking side, newer format
  /^PENDING PAYMENT$/i,             // card side, newer format
  /PAYMENT - THANK YOU/i,
];
export function isInternalPayment(name: string): boolean {
  return INTERNAL_PAYMENT_PATTERNS.some((re) => re.test(name));
}

export class PlaidService {
  // Create link token for user.
  // When accessToken is provided, the token opens Link in update mode so the
  // user can re-authenticate an existing item (e.g. after ITEM_LOGIN_REQUIRED).
  static async createLinkToken(userId: string, firebaseUid: string, accessToken?: string) {
    try {
      const response = await plaidClient.linkTokenCreate({
        user: {
          client_user_id: firebaseUid,
        },
        client_name: 'WantNot',
        // Update mode must not request products; the item already has them
        ...(accessToken ? { access_token: accessToken } : { products: [Products.Transactions] }),
        country_codes: [CountryCode.Us],
        language: 'en',
        redirect_uri: process.env.PLAID_LINK_REDIRECT,
      });

      return response.data.link_token;
    } catch (error) {
      console.error('Error creating link token:', getPlaidError(error), error);
      throw new PlaidSyncError('Failed to create link token', error);
    }
  }

  // Exchange public token for access token
  static async exchangePublicToken(publicToken: string) {
    try {
      const response = await plaidClient.itemPublicTokenExchange({
        public_token: publicToken,
      });

      return {
        accessToken: response.data.access_token,
        itemId: response.data.item_id,
      };
    } catch (error) {
      console.error('Error exchanging public token:', error);
      throw new Error('Failed to exchange public token');
    }
  }

  // Get account details from Plaid
  static async getAccountDetails(accessToken: string) {
    try {
      const response = await plaidClient.accountsGet({
        access_token: accessToken,
      });

      return response.data.accounts;
    } catch (error) {
      console.error('Error getting account details:', error);
      throw new Error('Failed to get account details');
    }
  }

  // Save account to database
  static async saveAccount(params: CreateAccountParams) {
    try {
      // Check if account already exists
      const existing = await db
        .select()
        .from(accounts)
        .where(eq(accounts.plaidAccountId, params.plaidAccountId))
        .limit(1);

      if (existing.length > 0) {
        // Update existing account
        const updated = await db
          .update(accounts)
          .set({
            name: params.name,
            officialName: params.officialName,
            currentBalance: params.currentBalance,
            availableBalance: params.availableBalance,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(accounts.plaidAccountId, params.plaidAccountId))
          .returning();

        return updated[0];
      }

      // Create new account
      const newAccount = await db
        .insert(accounts)
        .values({
          userId: params.userId,
          plaidAccountId: params.plaidAccountId,
          plaidItemId: params.plaidItemId,
          accessToken: params.accessToken,
          name: params.name,
          officialName: params.officialName,
          type: params.type,
          subtype: params.subtype,
          mask: params.mask,
          currentBalance: params.currentBalance,
          availableBalance: params.availableBalance,
          isoCurrencyCode: params.isoCurrencyCode || 'USD',
        })
        .returning();

      return newAccount[0];
    } catch (error) {
      console.error('Error saving account:', error);
      throw new Error('Failed to save account');
    }
  }

  // Sync transactions for an account using /transactions/sync
  static async syncTransactions(
    userId: string,
    accountId: string,
    accessToken: string
  ): Promise<{ added: number; modified: number; removed: number }> {
    try {
      // Get the account to retrieve the cursor
      const account = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1);

      if (account.length === 0) {
        throw new Error('Account not found');
      }

      const cursor = account[0].transactionsCursor || undefined;

      // /transactions/sync returns every account on the Item, so map each
      // transaction to its own account row instead of the caller's account.
      const itemAccounts = await db
        .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.plaidItemId, account[0].plaidItemId)));
      const accountIdByPlaidId = new Map(itemAccounts.map(a => [a.plaidAccountId, a.id]));
      const resolveAccountId = (plaidAccountId: string) => accountIdByPlaidId.get(plaidAccountId) ?? accountId;

      // Use /transactions/sync instead of /transactions/get
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: cursor,
        count: 500, // Max per request
      });

      const { added, modified, removed, next_cursor, has_more } = response.data;

      let addedCount = 0;
      let modifiedCount = 0;
      let removedCount = 0;

      // Handle ADDED transactions
      for (const txn of added) {
        try {
          // If this posted transaction replaces a pending one, update in place
          if (txn.pending_transaction_id) {
            const existingPending = await db
              .select()
              .from(transactions)
              .where(eq(transactions.plaidTransactionId, txn.pending_transaction_id))
              .limit(1);

            if (existingPending.length > 0) {
              // Replace the pending transaction with the posted version
              await db
                .update(transactions)
                .set({
                  accountId: resolveAccountId(txn.account_id),
                  plaidTransactionId: txn.transaction_id,
                  pendingTransactionId: txn.pending_transaction_id,
                  amount: txn.amount.toString(),
                  name: txn.name,
                  merchantName: txn.merchant_name || null,
                  date: new Date(txn.date),
                  authorizedDate: txn.authorized_date ? new Date(txn.authorized_date) : null,
                  pending: false,
                  plaidCategory: txn.category || null,
                  plaidCategoryId: txn.category_id || null,
                  updatedAt: new Date(),
                })
                .where(eq(transactions.id, existingPending[0].id));

              modifiedCount++;
              continue;
            }
          }

          // Use onConflictDoNothing to make inserts idempotent
          const result = await db
            .insert(transactions)
            .values({
              userId,
              accountId: resolveAccountId(txn.account_id),
              plaidTransactionId: txn.transaction_id,
              pendingTransactionId: txn.pending_transaction_id || undefined,
              amount: txn.amount.toString(),
              isoCurrencyCode: txn.iso_currency_code || 'USD',
              name: txn.name,
              merchantName: txn.merchant_name || null,
              date: new Date(txn.date),
              authorizedDate: txn.authorized_date ? new Date(txn.authorized_date) : null,
              pending: txn.pending,
              plaidCategory: txn.category || null,
              plaidCategoryId: txn.category_id || null,
              ...(isInternalPayment(txn.name) ? { isHidden: true, notes: 'Auto-hidden: card or loan payment' } : {}),
            })
            .onConflictDoNothing({ target: transactions.plaidTransactionId })
            .returning();

          if (result.length > 0) {
            addedCount++;
          }
        } catch (txnError) {
          console.error(`Error saving transaction ${txn.transaction_id}:`, txnError);
        }
      }

      // Handle MODIFIED transactions
      for (const txn of modified) {
        try {
          await db
            .update(transactions)
            .set({
              accountId: resolveAccountId(txn.account_id),
              amount: txn.amount.toString(),
              name: txn.name,
              merchantName: txn.merchant_name || null,
              date: new Date(txn.date),
              authorizedDate: txn.authorized_date ? new Date(txn.authorized_date) : null,
              pending: txn.pending,
              plaidCategory: txn.category || null,
              plaidCategoryId: txn.category_id || null,
              updatedAt: new Date(),
            })
            .where(eq(transactions.plaidTransactionId, txn.transaction_id));

          modifiedCount++;
        } catch (txnError) {
          console.error(`Error updating transaction ${txn.transaction_id}:`, txnError);
        }
      }

      // Handle REMOVED transactions (hide them instead of deleting to preserve user categorizations)
      for (const txnId of removed.map(r => r.transaction_id)) {
        try {
          await db
            .update(transactions)
            .set({
              isHidden: true,
              updatedAt: new Date(),
            })
            .where(eq(transactions.plaidTransactionId, txnId));

          removedCount++;
        } catch (txnError) {
          console.error(`Error hiding transaction ${txnId}:`, txnError);
        }
      }

      // The cursor belongs to the Item, so store it on every account row that shares it
      await db
        .update(accounts)
        .set({
          transactionsCursor: next_cursor,
          updatedAt: new Date(),
        })
        .where(and(eq(accounts.userId, userId), eq(accounts.plaidItemId, account[0].plaidItemId)));

      // If there are more transactions, recursively sync again
      if (has_more) {
        const nextResult = await this.syncTransactions(userId, accountId, accessToken);
        return {
          added: addedCount + nextResult.added,
          modified: modifiedCount + nextResult.modified,
          removed: removedCount + nextResult.removed,
        };
      }

      return {
        added: addedCount,
        modified: modifiedCount,
        removed: removedCount,
      };
    } catch (error) {
      // Preserve the Plaid error code from a nested (has_more) call
      if (error instanceof PlaidSyncError) throw error;
      console.error('Error syncing transactions:', getPlaidError(error), error);
      throw new PlaidSyncError('Failed to sync transactions', error);
    }
  }

  // Get user's accounts from database
  static async getUserAccounts(userId: string) {
    try {
      const userAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, userId));

      return userAccounts;
    } catch (error) {
      console.error('Error getting user accounts:', error);
      throw new Error('Failed to get user accounts');
    }
  }
}
