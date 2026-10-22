import { PlaidService } from '~/lib/plaid-service';
import { UserService } from '~/lib/user-service';
import { db, users, accounts } from '~/db';
import { eq } from 'drizzle-orm';
import { authenticateRequest } from '~/lib/firebase-admin';

export async function action({ request }: { request: Request }) {
  try {
    // Verify Firebase ID token
    const firebaseUser = await authenticateRequest(request);

    // Get or create user in database
    let user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      // Create user if doesn't exist
      const newUser = await db
        .insert(users)
        .values({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email!,
          displayName: firebaseUser.name || null,
        })
        .returning();

      user = newUser[0];
    }

    // Optional accountId => open Link in update mode for that account's item
    let accessToken: string | undefined;
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // No body is fine; that's a normal "connect new bank" request
    }

    if (body?.accountId) {
      const account = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, body.accountId))
        .limit(1);

      if (account.length === 0 || account[0].userId !== user.id) {
        return Response.json(
          { error: 'Account not found or unauthorized' },
          { status: 404 }
        );
      }

      accessToken = account[0].accessToken;
    }

    // Create link token
    const linkToken = await PlaidService.createLinkToken(user.id, firebaseUser.uid, accessToken);

    return Response.json({ link_token: linkToken, updateMode: Boolean(accessToken) });
  } catch (error) {
    console.error('Error in create-link-token:', error);
    return Response.json(
      { error: 'Failed to create link token' },
      { status: 500 }
    );
  }
}
