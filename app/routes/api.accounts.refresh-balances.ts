import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { PlaidService } from '~/lib/plaid-service';
import { db, accounts } from '~/db';
import { eq } from 'drizzle-orm';

// POST - Refresh balances for all user accounts
export async function action({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Get all user's accounts
    const userAccounts = await PlaidService.getUserAccounts(user.id);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Refresh each account's balance
    for (const account of userAccounts) {
      try {
        // Get fresh account details from Plaid
        const plaidAccounts = await PlaidService.getAccountDetails(account.accessToken);

        // Find this specific account in the response
        const updatedAccount = plaidAccounts.find(
          (a) => a.account_id === account.plaidAccountId
        );

        if (updatedAccount) {
          // Update balance in database
          await db
            .update(accounts)
            .set({
              currentBalance: updatedAccount.balances.current?.toString() || null,
              availableBalance: updatedAccount.balances.available?.toString() || null,
              updatedAt: new Date(),
            })
            .where(eq(accounts.id, account.id));

          successCount++;
        } else {
          errorCount++;
          errors.push(`Account ${account.name} not found in Plaid response`);
        }
      } catch (accountError) {
        console.error(`Error refreshing account ${account.id}:`, accountError);
        errorCount++;
        errors.push(`Failed to refresh ${account.name}`);
      }
    }

    return Response.json({
      success: true,
      refreshed: successCount,
      failed: errorCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error refreshing account balances:', error);
    return Response.json({ error: 'Failed to refresh balances' }, { status: 500 });
  }
}
