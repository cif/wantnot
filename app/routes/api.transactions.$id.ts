import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions } from '~/db';
import { eq, and } from 'drizzle-orm';

// GET - Get single transaction
export async function loader({ request, params }: { request: Request; params: { id: string } }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const transaction = await db
      .select()
      .from(transactions)
      .where(and(
        eq(transactions.id, params.id),
        eq(transactions.userId, user.id)
      ))
      .limit(1);

    if (transaction.length === 0) {
      return Response.json({ error: 'Transaction not found' }, { status: 404 });
    }

    return Response.json({ transaction: transaction[0] });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return Response.json({ error: 'Failed to fetch transaction' }, { status: 500 });
  }
}

// PATCH - Update transaction notes/memo
export async function action({ request, params }: { request: Request; params: { id: string } }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { notes, isHidden, isTransfer } = body;

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (notes !== undefined) updateData.notes = notes;
    if (isHidden !== undefined) updateData.isHidden = isHidden;
    if (isTransfer !== undefined) updateData.isTransfer = isTransfer;

    const updated = await db
      .update(transactions)
      .set(updateData)
      .where(and(
        eq(transactions.id, params.id),
        eq(transactions.userId, user.id)
      ))
      .returning();

    if (updated.length === 0) {
      return Response.json({ error: 'Transaction not found' }, { status: 404 });
    }

    return Response.json({ transaction: updated[0] });
  } catch (error) {
    console.error('Error updating transaction:', error);
    return Response.json({ error: 'Failed to update transaction' }, { status: 500 });
  }
}
