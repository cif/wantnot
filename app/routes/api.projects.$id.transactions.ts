import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions } from '~/db';
import { eq, and, desc } from 'drizzle-orm';

// GET - Get all transactions for a specific project
export async function loader({ request, params }: { request: Request; params: { id: string } }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const projectId = params.id;

    const projectTransactions = await db
      .select()
      .from(transactions)
      .where(and(
        eq(transactions.userId, user.id),
        eq(transactions.projectId, projectId),
        eq(transactions.isHidden, false),
        eq(transactions.pending, false)
      ))
      .orderBy(desc(transactions.date));

    return Response.json({ transactions: projectTransactions });
  } catch (error) {
    console.error('Error fetching project transactions:', error);
    return Response.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
