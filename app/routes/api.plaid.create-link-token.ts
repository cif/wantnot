import { PlaidService } from '~/lib/plaid-service';
import { UserService } from '~/lib/user-service';
import { db, users } from '~/db';
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

    // Create link token
    const linkToken = await PlaidService.createLinkToken(user.id, firebaseUser.uid);

    return Response.json({ link_token: linkToken });
  } catch (error) {
    console.error('Error in create-link-token:', error);
    return Response.json(
      { error: 'Failed to create link token' },
      { status: 500 }
    );
  }
}
