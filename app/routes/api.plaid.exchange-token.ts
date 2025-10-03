import { PlaidService } from '~/lib/plaid-service';
import { UserService } from '~/lib/user-service';
import { authenticateRequest } from '~/lib/firebase-admin';

export async function action({ request }: { request: Request }) {
  try {
    // Verify Firebase ID token
    const firebaseUser = await authenticateRequest(request);

    const body = await request.json();
    const { publicToken, metadata } = body;

    if (!publicToken) {
      return Response.json(
        { error: 'Missing publicToken' },
        { status: 400 }
      );
    }

    // Get user from database (should exist from create-link-token)
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json(
        { error: 'User not found. Please try connecting again.' },
        { status: 401 }
      );
    }

    // Exchange public token for access token
    const { accessToken, itemId } = await PlaidService.exchangePublicToken(publicToken);

    // Get account details from Plaid
    const plaidAccounts = await PlaidService.getAccountDetails(accessToken);

    // Save each account to database
    const savedAccounts = [];
    for (const account of plaidAccounts) {
      const savedAccount = await PlaidService.saveAccount({
        userId: user.id,
        plaidAccountId: account.account_id,
        plaidItemId: itemId,
        accessToken: accessToken,
        name: account.name,
        officialName: account.official_name || undefined,
        type: account.type,
        subtype: account.subtype || undefined,
        mask: account.mask || undefined,
        currentBalance: account.balances.current?.toString(),
        availableBalance: account.balances.available?.toString(),
        isoCurrencyCode: account.balances.iso_currency_code || 'USD',
      });

      savedAccounts.push(savedAccount);

      // Sync initial transactions for this account
      try {
        await PlaidService.syncTransactions(user.id, savedAccount.id, accessToken);
      } catch (syncError) {
        console.error('Error syncing initial transactions:', syncError);
        // Don't fail the whole request if transaction sync fails
      }
    }

    return Response.json({
      success: true,
      accounts: savedAccounts,
      message: `Successfully connected ${savedAccounts.length} account(s)`,
    });
  } catch (error) {
    console.error('Error in exchange-token:', error);
    return Response.json(
      { error: 'Failed to exchange token' },
      { status: 500 }
    );
  }
}
