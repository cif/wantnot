import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions } from '~/db';
import { eq, and, inArray } from 'drizzle-orm';
import { CategorizationService } from '~/lib/categorization-service';

// POST - Bulk categorize multiple transactions
export async function action({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { transactionIds, categoryId } = body;

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return Response.json({ error: 'transactionIds must be a non-empty array' }, { status: 400 });
    }

    // Verify all transactions belong to user
    const userTransactions = await db
      .select()
      .from(transactions)
      .where(and(
        inArray(transactions.id, transactionIds),
        eq(transactions.userId, user.id)
      ));

    if (userTransactions.length !== transactionIds.length) {
      return Response.json({ error: 'Some transactions not found or unauthorized' }, { status: 404 });
    }

    // Update all transactions
    await db
      .update(transactions)
      .set({
        categoryId: categoryId || null,
        autoCategorizationMethod: 'manual',
        autoCategorizationConfidence: 1.0,
        updatedAt: new Date(),
      })
      .where(inArray(transactions.id, transactionIds));

    // Learn from each categorization if a category was assigned
    if (categoryId) {
      for (const txn of userTransactions) {
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
    }

    return Response.json({
      success: true,
      message: `${transactionIds.length} transaction(s) categorized successfully`,
      count: transactionIds.length
    });
  } catch (error) {
    console.error('Error bulk categorizing transactions:', error);
    return Response.json({ error: 'Failed to categorize transactions' }, { status: 500 });
  }
}
