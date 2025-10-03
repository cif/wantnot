import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { PlaidService } from '~/lib/plaid-service';

export async function loader({ request }: { request: Request }) {
  try {
    // Verify Firebase ID token
    const firebaseUser = await authenticateRequest(request);

    // Get user from database
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get user's accounts
    const accounts = await PlaidService.getUserAccounts(user.id);

    return Response.json({ accounts });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return Response.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }
}
