import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions } from '~/db';
import { eq, and } from 'drizzle-orm';

// PUT - Tag transaction with project
export async function action({ request, params }: { request: Request; params: { id: string } }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const transactionId = params.id;
    const body = await request.json();
    const { projectId } = body;

    // Verify transaction belongs to user
    const transaction = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, user.id)))
      .limit(1);

    if (transaction.length === 0) {
      return Response.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Update transaction with project
    await db
      .update(transactions)
      .set({
        projectId: projectId || null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId));

    return Response.json({
      success: true,
      message: 'Transaction tagged with project'
    });
  } catch (error) {
    console.error('Error tagging transaction:', error);
    return Response.json({ error: 'Failed to tag transaction' }, { status: 500 });
  }
}
