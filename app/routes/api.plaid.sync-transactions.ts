import { PlaidService, PlaidSyncError } from '~/lib/plaid-service';
import { UserService } from '~/lib/user-service';
import { db, accounts } from '~/db';
import { eq } from 'drizzle-orm';
import { authenticateRequest } from '~/lib/firebase-admin';

export async function action({ request }: { request: Request }) {
  try {
    // Verify Firebase ID token
    const firebaseUser = await authenticateRequest(request);

    const body = await request.json();
    const { accountId } = body;

    // Get user from database
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // If accountId is provided, sync that account
    // Otherwise, sync all user's accounts
    let accountsToSync;
    if (accountId) {
      const account = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .limit(1);

      if (account.length === 0 || account[0].userId !== user.id) {
        return Response.json(
          { error: 'Account not found or unauthorized' },
          { status: 404 }
        );
      }

      accountsToSync = account;
    } else {
      accountsToSync = await PlaidService.getUserAccounts(user.id);
    }

    // Sync transactions for each account
    const results = [];
    for (const account of accountsToSync) {
      try {
        const result = await PlaidService.syncTransactions(
          user.id,
          account.id,
          account.accessToken
        );

        results.push({
          accountId: account.id,
          accountName: account.name,
          ...result,
        });
      } catch (error) {
        console.error(`Error syncing account ${account.id}:`, error);
        const plaidError = error instanceof PlaidSyncError ? error : null;
        results.push({
          accountId: account.id,
          accountName: account.name,
          error: 'Failed to sync',
          errorCode: plaidError?.code ?? null,
          errorMessage: plaidError?.plaidMessage ?? null,
          needsReconnect: plaidError?.needsReconnect ?? false,
        });
      }
    }

    const failed = results.filter((r: any) => r.error);
    const reconnect = results.find((r: any) => r.needsReconnect);

    return Response.json({
      success: failed.length === 0,
      results,
      totalAccounts: accountsToSync.length,
      syncedAccounts: results.length - failed.length,
      // Any account on the expired item can be used to open Link in update mode
      needsReconnect: Boolean(reconnect),
      reconnectAccountId: reconnect?.accountId ?? null,
      reconnectAccountNames: results.filter((r: any) => r.needsReconnect).map((r: any) => r.accountName),
    });
  } catch (error) {
    console.error('Error in sync-transactions:', error);
    return Response.json(
      { error: 'Failed to sync transactions' },
      { status: 500 }
    );
  }
}
