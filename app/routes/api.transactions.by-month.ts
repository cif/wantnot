import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions } from '~/db';
import { eq, and, gte, lt, desc } from 'drizzle-orm';

// GET - Get transactions for a specific month
export async function loader({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Get parameters from URL
    const url = new URL(request.url);
    const month = url.searchParams.get('month'); // Format: YYYY-MM
    const includeHidden = url.searchParams.get('includeHidden') === 'true';

    if (!month) {
      return Response.json({ error: 'Month parameter required' }, { status: 400 });
    }

    // Parse the month parameter
    const [year, monthNum] = month.split('-').map(Number);

    // Create start and end dates for the month
    const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
    const endDate = new Date(Date.UTC(year, monthNum, 1));

    // Build where conditions
    const conditions = [
      eq(transactions.userId, user.id),
      gte(transactions.date, startDate),
      lt(transactions.date, endDate),
    ];

    // Add hidden filter if not including hidden
    if (!includeHidden) {
      conditions.push(eq(transactions.isHidden, false));
    }

    // Get transactions for the specified month
    const monthTransactions = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.date));

    console.log(`Fetching ${month} transactions, includeHidden=${includeHidden}, found ${monthTransactions.length} transactions`);
    const hiddenCount = monthTransactions.filter(t => t.isHidden).length;
    console.log(`Hidden transactions in result: ${hiddenCount}`);

    return Response.json({ transactions: monthTransactions });
  } catch (error) {
    console.error('Error fetching transactions by month:', error);
    return Response.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
