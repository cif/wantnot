import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions } from '~/db';
import { eq, desc, and, sql } from 'drizzle-orm';

export async function loader({ request }: { request: Request }) {
  try {
    // Verify Firebase ID token
    const firebaseUser = await authenticateRequest(request);

    // Get user from database
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get parameters from URL
    const url = new URL(request.url);
    const month = url.searchParams.get('month'); // Format: YYYY-MM
    const includeHidden = url.searchParams.get('includeHidden') === 'true';

    // Build where conditions
    const conditions = [eq(transactions.userId, user.id)];

    // Add month filter if provided
    // Use computed month/year: manual_month_year if set, otherwise extract from date
    if (month) {
      // Compare against computed month/year:
      // COALESCE(manual_month_year, TO_CHAR(date AT TIME ZONE 'UTC', 'YYYY-MM'))
      conditions.push(
        sql`COALESCE(${transactions.manualMonthYear}, TO_CHAR(${transactions.date} AT TIME ZONE 'UTC', 'YYYY-MM')) = ${month}`
      );
    }

    // Add hidden filter if not including hidden
    if (!includeHidden) {
      conditions.push(eq(transactions.isHidden, false));
    }

    // Get user's transactions, ordered by date (most recent first)
    const userTransactions = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.date))
      .limit(month ? 10_000 : 500); // Limit to 500 if not filtering by month

    return Response.json({ transactions: userTransactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return Response.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
