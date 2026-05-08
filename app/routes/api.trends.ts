import { authenticateRequest } from '~/lib/firebase-admin';
import { UserService } from '~/lib/user-service';
import { db, transactions, categories } from '~/db';
import { eq, and, sql } from 'drizzle-orm';

export async function loader({ request }: { request: Request }) {
  try {
    const firebaseUser = await authenticateRequest(request);
    const user = await UserService.getUserByFirebaseUid(firebaseUser.uid);

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Build trailing 12 months ending at current month
    const now = new Date();
    const allMonths: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      allMonths.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }

    // Fetch user categories
    const userCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, user.id));

    // Aggregate monthly spending by category using COALESCE for manualMonthYear
    const effectiveMonth = sql`COALESCE(${transactions.manualMonthYear}, TO_CHAR(${transactions.date} AT TIME ZONE 'UTC', 'YYYY-MM'))`;

    const monthlySpending = await db
      .select({
        month: effectiveMonth.as('effective_month'),
        categoryId: transactions.categoryId,
        total: sql<string>`SUM(CAST(${transactions.amount} AS DECIMAL))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(transactions)
      .where(and(
        eq(transactions.userId, user.id),
        eq(transactions.isHidden, false),
        eq(transactions.pending, false),
        eq(transactions.isTransfer, false),
        sql`COALESCE(${transactions.manualMonthYear}, TO_CHAR(${transactions.date} AT TIME ZONE 'UTC', 'YYYY-MM')) IN (${sql.join(allMonths.map(m => sql`${m}`), sql`, `)})`
      ))
      .groupBy(sql`effective_month`, transactions.categoryId);

    // Build category lookup
    const catMap = new Map(userCategories.map(c => [c.id, c]));

    // Organize data by month
    const monthlyData = allMonths.map(month => {
      const monthRows = monthlySpending.filter(r => r.month === month);

      const catEntries = monthRows.map(row => {
        const cat = row.categoryId ? catMap.get(row.categoryId) : null;
        const total = parseFloat(row.total);
        return {
          categoryId: row.categoryId,
          name: cat?.name || 'Uncategorized',
          color: cat?.color || '#9CA3AF',
          isIncome: cat?.isIncome || false,
          spent: total > 0 ? total : 0,
          income: total < 0 ? Math.abs(total) : 0,
          count: row.count,
        };
      });

      return {
        month,
        categories: catEntries,
        totalSpent: catEntries.reduce((s, c) => s + c.spent, 0),
        totalIncome: catEntries.reduce((s, c) => s + c.income, 0),
      };
    });

    // Build per-category annual aggregates
    const categoryTotals = new Map<string, {
      amounts: number[];  // 12 months
      totalSpent: number;
      totalIncome: number;
      monthsActive: number;
    }>();

    // Initialize all categories
    for (const cat of userCategories) {
      categoryTotals.set(cat.id, {
        amounts: new Array(12).fill(0),
        totalSpent: 0,
        totalIncome: 0,
        monthsActive: 0,
      });
    }
    // Also track uncategorized
    categoryTotals.set('uncategorized', {
      amounts: new Array(12).fill(0),
      totalSpent: 0,
      totalIncome: 0,
      monthsActive: 0,
    });

    const monthIndexMap = new Map(allMonths.map((m, i) => [m, i]));

    for (const row of monthlySpending) {
      const catId = row.categoryId || 'uncategorized';
      const monthIndex = monthIndexMap.get(row.month as string);
      if (monthIndex === undefined) continue;
      const total = parseFloat(row.total);
      const entry = categoryTotals.get(catId);
      if (!entry) continue;

      const amount = Math.abs(total);
      entry.amounts[monthIndex] = amount;
      if (total > 0) entry.totalSpent += total;
      else entry.totalIncome += Math.abs(total);
    }

    // Compute monthsActive
    for (const entry of categoryTotals.values()) {
      entry.monthsActive = entry.amounts.filter(a => a > 0).length;
    }

    const categoryAnnuals = Array.from(categoryTotals.entries())
      .map(([catId, data]) => {
        const cat = catId !== 'uncategorized' ? catMap.get(catId) : null;
        const isIncome = cat?.isIncome || false;
        const annualSpent = isIncome ? data.totalIncome : data.totalSpent;
        const monthlyAverage = data.monthsActive > 0 ? annualSpent / data.monthsActive : 0;
        const budgetLimit = cat?.budgetLimit ? parseFloat(cat.budgetLimit) : null;

        // Find min/max months (only months with spending)
        const activeAmounts = data.amounts
          .map((a, i) => ({ amount: a, month: allMonths[i] }))
          .filter(x => x.amount > 0);

        const minMonth = activeAmounts.length > 0
          ? activeAmounts.reduce((min, x) => x.amount < min.amount ? x : min)
          : null;
        const maxMonth = activeAmounts.length > 0
          ? activeAmounts.reduce((max, x) => x.amount > max.amount ? x : max)
          : null;

        // Anomaly detection: months > 2x average
        const anomalies = activeAmounts
          .filter(x => monthlyAverage > 0 && x.amount > monthlyAverage * 2)
          .map(x => ({
            month: x.month,
            amount: x.amount,
            ratio: x.amount / monthlyAverage,
          }));

        return {
          categoryId: catId,
          name: cat?.name || 'Uncategorized',
          color: cat?.color || '#9CA3AF',
          isIncome,
          budgetLimit,
          annualBudget: budgetLimit ? budgetLimit * 12 : null,
          annualSpent,
          monthlyAverage,
          monthsActive: data.monthsActive,
          minMonth,
          maxMonth,
          monthlyAmounts: data.amounts,
          anomalies,
        };
      })
      .filter(c => c.annualSpent > 0 || (c.budgetLimit && c.budgetLimit > 0))
      .sort((a, b) => b.annualSpent - a.annualSpent);

    // Annual summary
    const totalSpent = monthlyData.reduce((s, m) => s + m.totalSpent, 0);
    const totalIncome = monthlyData.reduce((s, m) => s + m.totalIncome, 0);
    const netSavings = totalIncome - totalSpent;
    const totalAnnualBudget = userCategories
      .filter(c => c.budgetLimit && !c.isIncome)
      .reduce((s, c) => s + parseFloat(c.budgetLimit!) * 12, 0);

    return Response.json({
      months: allMonths,
      monthlyData,
      categoryAnnuals,
      annualSummary: {
        totalSpent,
        totalIncome,
        netSavings,
        savingsRate: totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0,
        totalAnnualBudget: totalAnnualBudget > 0 ? totalAnnualBudget : null,
        budgetUtilization: totalAnnualBudget > 0 ? (totalSpent / totalAnnualBudget) * 100 : null,
      },
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    return Response.json({ error: 'Failed to fetch trends' }, { status: 500 });
  }
}
