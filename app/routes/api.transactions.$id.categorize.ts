import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions } from '~/db';
import { eq, and } from 'drizzle-orm';
import { CategorizationService } from '~/lib/categorization-service';

// PUT - Manually categorize a transaction
export async function action({ request, params }: { request: Request; params: { id: string } }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const transactionId = params.id;
    const body = await request.json();
    const { categoryId } = body;

    // Verify transaction belongs to user
    const transaction = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, user.id)))
      .limit(1);

    if (transaction.length === 0) {
      return Response.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const txn = transaction[0];

    // Update transaction with new category
    await db
      .update(transactions)
      .set({
        categoryId: categoryId || null,
        autoCategorizationMethod: 'manual',
        autoCategorizationConfidence: 1.0,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId));

    // Learn from this categorization if a category was assigned
    if (categoryId) {
      await CategorizationService.learnFromCategorization(
        user.id,
        {
          name: txn.name,
          merchantName: txn.merchantName,
          amount: txn.amount,
          plaidCategory: txn.plaidCategory,
        },
        categoryId,
        true // contribute to anonymized DB
      );
    }

    return Response.json({
      success: true,
      message: 'Transaction categorized successfully'
    });
  } catch (error) {
    console.error('Error categorizing transaction:', error);
    return Response.json({ error: 'Failed to categorize transaction' }, { status: 500 });
  }
}
