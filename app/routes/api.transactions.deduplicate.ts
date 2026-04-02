import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions } from '~/db';
import { eq, and, inArray, desc } from 'drizzle-orm';

// POST - Find and remove duplicate transactions
export async function action({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch all user transactions
    const allTxns = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, user.id))
      .orderBy(desc(transactions.date));

    // Group by (amount, date, name, merchantName) to find duplicates
    const groups = new Map<string, typeof allTxns>();

    for (const txn of allTxns) {
      const key = `${txn.amount}|${txn.date?.toISOString()}|${txn.name}|${txn.merchantName || ''}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(txn);
    }

    // For each duplicate group, keep the best one (categorized first, then oldest)
    const idsToRemove: string[] = [];

    for (const [, group] of groups) {
      if (group.length <= 1) continue;

      // Sort: categorized first, then by createdAt ascending
      group.sort((a, b) => {
        if (a.categoryId && !b.categoryId) return -1;
        if (!a.categoryId && b.categoryId) return 1;
        return (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0);
      });

      // Keep the first, mark rest for removal
      for (let i = 1; i < group.length; i++) {
        idsToRemove.push(group[i].id);
      }
    }

    // Delete duplicates in batches
    let totalRemoved = 0;
    const batchSize = 100;
    for (let i = 0; i < idsToRemove.length; i += batchSize) {
      const batch = idsToRemove.slice(i, i + batchSize);
      await db
        .delete(transactions)
        .where(
          and(
            inArray(transactions.id, batch),
            eq(transactions.userId, user.id),
          ),
        );
      totalRemoved += batch.length;
    }

    return Response.json({
      success: true,
      duplicateGroups: Array.from(groups.values()).filter((g) => g.length > 1).length,
      transactionsRemoved: totalRemoved,
    });
  } catch (error) {
    console.error('Error deduplicating transactions:', error);
    return Response.json({ error: 'Failed to deduplicate' }, { status: 500 });
  }
}
