import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions } from '~/db';
import { eq, desc, and } from 'drizzle-orm';

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

    // Get user's transactions, ordered by date (most recent first)
    // Filter out hidden and pending transactions
    const userTransactions = await db
      .select()
      .from(transactions)
      .where(and(
        eq(transactions.userId, user.id),
        eq(transactions.isHidden, false),
        eq(transactions.pending, false)
      ))
      .orderBy(desc(transactions.date))
      .limit(100); // Limit to most recent 100 transactions

    return Response.json({ transactions: userTransactions });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return Response.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
