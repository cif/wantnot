import { eq } from 'drizzle-orm';
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

export class PlaidService {
  // Create link token for user
  static async createLinkToken(userId: string, firebaseUid: string) {
    try {
      const response = await plaidClient.linkTokenCreate({
        user: {
          client_user_id: firebaseUid,
        },
        client_name: 'WantNot',
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        language: 'en',
        redirect_uri: process.env.PLAID_LINK_REDIRECT,
      });

      return response.data.link_token;
    } catch (error) {
      console.error('Error creating link token:', error);
      throw new Error('Failed to create link token');
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
  static async syncTransactions(userId: string, accountId: string, accessToken: string) {
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
          // Skip auto-categorization during sync for performance
          // Users can use the AI suggest feature to categorize in bulk

          // Use onConflictDoNothing to make inserts idempotent
          const result = await db
            .insert(transactions)
            .values({
              userId,
              accountId,
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

      // Update the cursor for this account
      await db
        .update(accounts)
        .set({
          transactionsCursor: next_cursor,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, accountId));

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
      console.error('Error syncing transactions:', error);
      throw new Error('Failed to sync transactions');
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
