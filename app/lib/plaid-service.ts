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

  // Sync transactions for an account
  static async syncTransactions(userId: string, accountId: string, accessToken: string) {
    try {
      // Get transactions from the last 30 days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const endDate = new Date();

      const response = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      });

      const plaidTransactions = response.data.transactions;

      // Save transactions to database
      for (const txn of plaidTransactions) {
        try {
          // Check if transaction already exists
          const existing = await db
            .select()
            .from(transactions)
            .where(eq(transactions.plaidTransactionId, txn.transaction_id))
            .limit(1);

          if (existing.length === 0) {
            // Auto-categorize the transaction
            const categorization = await CategorizationService.categorizeTransaction(userId, {
              name: txn.name,
              merchantName: txn.merchant_name || null,
              amount: txn.amount.toString(),
              plaidCategory: txn.category || null,
            });

            await db.insert(transactions).values({
              userId,
              accountId,
              plaidTransactionId: txn.transaction_id,
              amount: txn.amount.toString(),
              isoCurrencyCode: txn.iso_currency_code || 'USD',
              name: txn.name,
              merchantName: txn.merchant_name || null,
              date: new Date(txn.date),
              authorizedDate: txn.authorized_date ? new Date(txn.authorized_date) : null,
              pending: txn.pending,
              plaidCategory: txn.category || null,
              plaidCategoryId: txn.category_id || null,
              categoryId: categorization.categoryId || undefined,
              autoCategorizationMethod: categorization.method || undefined,
              autoCategorizationConfidence: categorization.confidence || undefined,
            });
          }
        } catch (txnError) {
          console.error(`Error saving transaction ${txn.transaction_id}:`, txnError);
          // Continue with other transactions
        }
      }

      return {
        added: plaidTransactions.length,
        total: response.data.total_transactions,
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
