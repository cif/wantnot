import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions, categoryMatchings } from '~/db';
import { eq, and, isNull, isNotNull, desc } from 'drizzle-orm';

function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

export async function loader({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Get all uncategorized, non-pending, non-transfer, non-hidden transactions
    const uncategorized = await db
      .select()
      .from(transactions)
      .where(and(
        eq(transactions.userId, user.id),
        isNull(transactions.categoryId),
        eq(transactions.pending, false),
        eq(transactions.isTransfer, false),
        eq(transactions.isHidden, false)
      ))
      .orderBy(desc(transactions.date));

    // Group by normalized merchant name
    const groupMap = new Map<string, {
      merchantPattern: string;
      displayName: string;
      transactions: typeof uncategorized;
    }>();

    for (const txn of uncategorized) {
      const rawName = txn.merchantName || txn.name;
      const normalized = normalizeMerchant(rawName);

      if (!groupMap.has(normalized)) {
        groupMap.set(normalized, {
          merchantPattern: normalized,
          displayName: txn.merchantName || txn.name,
          transactions: [],
        });
      }
      groupMap.get(normalized)!.transactions.push(txn);
    }

    // Fetch all user's category matchings at once
    const allMatchings = await db
      .select()
      .from(categoryMatchings)
      .where(eq(categoryMatchings.userId, user.id));

    // Fetch recently categorized transactions with projects for project suggestions
    const recentWithProjects = await db
      .select()
      .from(transactions)
      .where(and(
        eq(transactions.userId, user.id),
        isNotNull(transactions.categoryId),
        isNotNull(transactions.projectId)
      ))
      .orderBy(desc(transactions.date))
      .limit(500);

    // Build project suggestion map (most recent project per normalized merchant)
    const projectByMerchant = new Map<string, string>();
    for (const txn of recentWithProjects) {
      const rawName = txn.merchantName || txn.name;
      const normalized = normalizeMerchant(rawName);
      if (!projectByMerchant.has(normalized) && txn.projectId) {
        projectByMerchant.set(normalized, txn.projectId);
      }
    }

    // Build groups with suggestions
    const groups = [];

    for (const [pattern, group] of groupMap) {
      const matching = allMatchings
        .filter(m => m.merchantPattern === pattern)
        .sort((a, b) => b.confidence - a.confidence)[0];

      const suggestedProjectId = projectByMerchant.get(pattern) || null;

      groups.push({
        merchantPattern: pattern,
        displayName: group.displayName,
        transactions: group.transactions,
        count: group.transactions.length,
        totalAmount: group.transactions.reduce(
          (sum, t) => sum + parseFloat(t.amount), 0
        ),
        suggestedCategoryId: matching?.categoryId || null,
        suggestedProjectId,
        confidence: matching?.confidence || 0,
      });
    }

    // Sort: groups with suggestions first, then by count, then by total
    groups.sort((a, b) => {
      const aHasSuggestion = a.suggestedCategoryId ? 1 : 0;
      const bHasSuggestion = b.suggestedCategoryId ? 1 : 0;
      if (bHasSuggestion !== aHasSuggestion) return bHasSuggestion - aHasSuggestion;
      if (b.count !== a.count) return b.count - a.count;
      return Math.abs(b.totalAmount) - Math.abs(a.totalAmount);
    });

    return Response.json({ groups });
  } catch (error) {
    console.error('Error fetching recurring groups:', error);
    return Response.json({ error: 'Failed to fetch recurring groups' }, { status: 500 });
  }
}
