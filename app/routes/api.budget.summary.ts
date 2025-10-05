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
    let priorStartDate: Date;
    let priorEndDate: Date;

    if (month) {
      // Parse specific month
      const [year, monthNum] = month.split('-').map(Number);
      startDate = new Date(year, monthNum - 1, 1);
      endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);
      priorStartDate = new Date(year, monthNum - 2, 1);
      priorEndDate = new Date(year, monthNum - 1, 0, 23, 59, 59, 999);
    } else {
      // Default to current month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      priorStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      priorEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    }

    // Get all user categories
    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, user.id));

    // Get transactions for current month grouped by category
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

    // Get transactions for prior month grouped by category
    const priorCategorySummary = await db
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
        gte(transactions.date, priorStartDate),
        lte(transactions.date, priorEndDate)
      ))
      .groupBy(transactions.categoryId);

    // Build summary with category details and prior month comparison
    const summaryByCategory = categorySummary.map(item => {
      const category = userCategories.find(c => c.id === item.categoryId);
      const total = parseFloat(item.total);
      const isExpense = total > 0;

      // Find prior month data for this category
      const priorItem = priorCategorySummary.find(p => p.categoryId === item.categoryId);
      const priorTotal = priorItem ? parseFloat(priorItem.total) : 0;

      return {
        categoryId: item.categoryId,
        categoryName: category ? category.name : 'Uncategorized',
        categoryColor: category?.color || '#6B7280',
        budgetLimit: category?.budgetLimit ? parseFloat(category.budgetLimit) : null,
        spent: isExpense ? total : 0,
        income: isExpense ? 0 : Math.abs(total),
        transactionCount: item.count,
        priorSpent: isExpense ? priorTotal : 0,
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
    const totalPriorSpent = expenseSummary.reduce((sum, cat) => sum + cat.priorSpent, 0);
    const totalBudget = userCategories
      .filter(c => c.budgetLimit && !c.isIncome)
      .reduce((sum, c) => sum + parseFloat(c.budgetLimit!), 0);

    return Response.json({
      month: month || `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`,
      priorMonth: `${priorStartDate.getFullYear()}-${String(priorStartDate.getMonth() + 1).padStart(2, '0')}`,
      startDate,
      endDate,
      priorStartDate,
      priorEndDate,
      summary: expenseSummary, // Only expenses
      totals: {
        spent: totalSpent,
        priorSpent: totalPriorSpent,
        change: totalPriorSpent > 0 ? ((totalSpent - totalPriorSpent) / totalPriorSpent) * 100 : 0,
        budget: totalBudget > 0 ? totalBudget : null,
        percentOfBudget: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : null,
      },
    });
  } catch (error) {
    console.error('Error fetching budget summary:', error);
    return Response.json({ error: 'Failed to fetch budget summary' }, { status: 500 });
  }
}
