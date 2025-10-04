import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions } from '~/db';
import { eq, and, isNull } from 'drizzle-orm';

// GET - Get all uncategorized transactions
export async function loader({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const uncategorized = await db
      .select()
      .from(transactions)
      .where(and(
        eq(transactions.userId, user.id),
        isNull(transactions.categoryId)
      ))
      .orderBy(transactions.date);

    return Response.json({
      transactions: uncategorized,
      count: uncategorized.length
    });
  } catch (error) {
    console.error('Error fetching uncategorized transactions:', error);
    return Response.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
