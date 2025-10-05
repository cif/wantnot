import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { CategorizationService } from '~/lib/categorization-service';

// POST - Get AI suggestions for batch categorization
export async function action({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { limit = 50 } = body;

    const result = await CategorizationService.batchAISuggest(user.id, limit);

    return Response.json(result);
  } catch (error) {
    console.error('Error getting AI suggestions:', error);
    return Response.json({ error: 'Failed to get AI suggestions' }, { status: 500 });
  }
}
