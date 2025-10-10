import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions } from '~/db';
import { eq, and, isNull, desc } from 'drizzle-orm';

// GET - Get ALL uncategorized transactions (ignoring month filter)
export async function loader({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Get parameters from URL
    const url = new URL(request.url);
    const includeHidden = url.searchParams.get('includeHidden') === 'true';

    // Build where conditions
    const conditions = [
      eq(transactions.userId, user.id),
      isNull(transactions.categoryId),
      eq(transactions.pending, false),
      eq(transactions.isTransfer, false)
    ];

    // Add hidden filter if not including hidden
    if (!includeHidden) {
      conditions.push(eq(transactions.isHidden, false));
    }

    // Get ALL uncategorized transactions, not just recent 100
    const uncategorized = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.date));

    return Response.json({
      transactions: uncategorized,
      count: uncategorized.length
    });
  } catch (error) {
    console.error('Error fetching uncategorized transactions:', error);
    return Response.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
