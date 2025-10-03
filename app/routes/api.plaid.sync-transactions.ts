import { PlaidService } from '~/lib/plaid-service';
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
        results.push({
          accountId: account.id,
          accountName: account.name,
          error: 'Failed to sync',
        });
      }
    }

    return Response.json({
      success: true,
      results,
      totalAccounts: accountsToSync.length,
    });
  } catch (error) {
    console.error('Error in sync-transactions:', error);
    return Response.json(
      { error: 'Failed to sync transactions' },
      { status: 500 }
    );
  }
}
