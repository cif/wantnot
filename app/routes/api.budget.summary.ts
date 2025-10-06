import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions, categories } from '~/db';
import { eq, and, sql, gte, lte } from 'drizzle-orm';

// GET - Get budget summary by category for a given month
export async function loader({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const month = url.searchParams.get('month'); // Format: YYYY-MM

    let startDate: Date;
    let endDate: Date;

    if (month) {
      // Parse specific month - use UTC to match database dates
      const [year, monthNum] = month.split('-').map(Number);
      startDate = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59, 999));
    } else {
      // Default to current month - use UTC to match database dates
      const now = new Date();
      startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    }

    // Get all user categories
    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, user.id));

    // Get transactions for the specified month grouped by category
    const categorySummary = await db
      .select({
        categoryId: transactions.categoryId,
        total: sql<string>`SUM(CAST(${transactions.amount} AS DECIMAL))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.userId, user.id),
        eq(transactions.isHidden, false),
        eq(transactions.pending, false),
        gte(transactions.date, startDate),
        lte(transactions.date, endDate)
      ))
      .groupBy(transactions.categoryId);

    // Build summary with category details
    const summaryByCategory = categorySummary.map(item => {
      const category = userCategories.find(c => c.id === item.categoryId);
      const total = parseFloat(item.total);
      const isExpense = total > 0;

      return {
        categoryId: item.categoryId,
        categoryName: category ? category.name : 'Uncategorized',
        categoryColor: category?.color || '#6B7280',
        budgetLimit: category?.budgetLimit ? parseFloat(category.budgetLimit) : null,
        spent: isExpense ? total : 0,
        income: isExpense ? 0 : Math.abs(total),
        transactionCount: item.count,
        percentOfBudget: category?.budgetLimit
          ? (total / parseFloat(category.budgetLimit)) * 100
          : null,
      };
    });

    // Sort alphabetically by category name
    summaryByCategory.sort((a, b) => a.categoryName.localeCompare(b.categoryName));

    // Filter to expenses only and calculate totals
    const expenseSummary = summaryByCategory.filter(cat => cat.spent > 0);
    const totalSpent = expenseSummary.reduce((sum, cat) => sum + cat.spent, 0);

    // Calculate budgeted vs unbudgeted spending
    const budgetedSpent = expenseSummary
      .filter(cat => cat.budgetLimit)
      .reduce((sum, cat) => sum + cat.spent, 0);
    const unbudgetedSpent = expenseSummary
      .filter(cat => !cat.budgetLimit)
      .reduce((sum, cat) => sum + cat.spent, 0);

    const totalBudget = userCategories
      .filter(c => c.budgetLimit && !c.isIncome)
      .reduce((sum, c) => sum + parseFloat(c.budgetLimit!), 0);

    return Response.json({
      month: month || `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}`,
      startDate,
      endDate,
      summary: expenseSummary, // Only expenses
      totals: {
        spent: totalSpent,
        budgeted: budgetedSpent,
        unbudgeted: unbudgetedSpent,
        budget: totalBudget > 0 ? totalBudget : null,
        percentOfBudget: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : null,
      },
    });
  } catch (error) {
    console.error('Error fetching budget summary:', error);
    return Response.json({ error: 'Failed to fetch budget summary' }, { status: 500 });
  }
}
