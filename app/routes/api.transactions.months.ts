import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions } from '~/db';
import { eq, sql } from 'drizzle-orm';

export async function loader({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const months = await db
      .selectDistinct({
        monthYear: sql<string>`COALESCE(${transactions.manualMonthYear}, TO_CHAR(${transactions.date} AT TIME ZONE 'UTC', 'YYYY-MM'))`.as('month_year'),
      })
      .from(transactions)
      .where(eq(transactions.userId, user.id))
      .orderBy(sql`month_year DESC`);

    return Response.json({ months: months.map(m => m.monthYear) });
  } catch (error) {
    console.error('Error fetching transaction months:', error);
    return Response.json({ error: 'Failed to fetch months' }, { status: 500 });
  }
}
