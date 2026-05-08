import type { Route } from "./+types/trends";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { AppLayout } from "~/components/AppLayout";
import { useAuth } from "~/contexts/AuthContext";
import { useState, useEffect, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "~/lib/format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LineChart,
  Line,
} from "recharts";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Trends - WantNot" },
    { name: "description", content: "Annual spending trends and patterns" },
  ];
}

export default function Trends() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <TrendsPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function TrendsPage() {
  const { getIdToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [chartMode, setChartMode] = useState<"stacked" | "grouped">("stacked");

  const fetchTrends = async () => {
    try {
      setLoading(true);
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch("/api/trends", {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (response.ok) {
        setData(await response.json());
      }
    } catch (error) {
      console.error("Error fetching trends:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrends();
  }, []);

  // Transform monthly data for stacked bar chart
  const chartData = useMemo(() => {
    if (!data?.monthlyData) return [];

    // Collect all expense category names across all months
    const allExpenseCategories = new Map<string, string>();
    for (const month of data.monthlyData) {
      for (const cat of month.categories) {
        if (!cat.isIncome && cat.spent > 0) {
          allExpenseCategories.set(cat.name, cat.color);
        }
      }
    }

    return data.monthlyData.map((month: any) => {
      const entry: any = {
        month: new Date(month.month + "-01").toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
        totalSpent: month.totalSpent,
        totalIncome: month.totalIncome,
      };

      // Add each category's spending as a key
      for (const cat of month.categories) {
        if (!cat.isIncome && cat.spent > 0) {
          entry[cat.name] = cat.spent;
        }
      }

      return entry;
    });
  }, [data]);

  // Get unique expense categories for chart bars
  const expenseCategories = useMemo(() => {
    if (!data?.categoryAnnuals) return [];
    return data.categoryAnnuals
      .filter((c: any) => !c.isIncome && c.annualSpent > 0)
      .map((c: any) => ({ name: c.name, color: c.color }));
  }, [data]);

  // Average monthly spending for reference line
  const avgMonthlySpending = useMemo(() => {
    if (!data?.annualSummary) return 0;
    const monthsWithData = data.monthlyData.filter(
      (m: any) => m.totalSpent > 0,
    ).length;
    return monthsWithData > 0
      ? data.annualSummary.totalSpent / monthsWithData
      : 0;
  }, [data]);

  // Income vs expense line chart data
  const incomeExpenseData = useMemo(() => {
    if (!data?.monthlyData) return [];
    return data.monthlyData.map((month: any) => ({
      month: new Date(month.month + "-01").toLocaleDateString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
      Income: month.totalIncome,
      Expenses: month.totalSpent,
      Net: month.totalIncome - month.totalSpent,
    }));
  }, [data]);

  if (loading && !data) {
    return (
      <div className="p-4 max-w-7xl mx-auto">
        <div className="text-gray-600 text-center py-16">
          Loading trends...
        </div>
      </div>
    );
  }

  const summary = data?.annualSummary;
  const catAnnuals = data?.categoryAnnuals || [];
  const expenseCats = catAnnuals.filter((c: any) => !c.isIncome);
  const incomeCats = catAnnuals.filter((c: any) => c.isIncome);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Trends</h1>
        <p className="text-sm text-gray-600 mt-0.5">
          Last 12 months
        </p>
      </div>

      {/* Annual Overview Cards */}
      {summary && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Total Expenses</p>
            <p className="text-xl font-bold text-gray-700 tabular-nums">
              {formatCurrency(summary.totalSpent)}
            </p>
            {avgMonthlySpending > 0 && (
              <p className="text-xs text-gray-500 mt-1 tabular-nums">
                {formatCurrency(avgMonthlySpending)}/mo avg
              </p>
            )}
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Total Income</p>
            <p className="text-xl font-bold text-green-600 tabular-nums">
              {formatCurrency(summary.totalIncome, { showSign: true })}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <p className="text-xs text-gray-600 mb-1">Net Savings</p>
            <p
              className={`text-xl font-bold tabular-nums ${summary.netSavings >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {summary.netSavings >= 0 ? "+" : ""}
              {formatCurrency(summary.netSavings)}
            </p>
            {summary.savingsRate !== 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {summary.savingsRate.toFixed(1)}% savings rate
              </p>
            )}
          </div>
        </div>
      )}

      {/* Monthly Spending Chart */}
      {chartData.length > 0 && expenseCategories.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Monthly Spending
              </h3>
              <p className="text-sm text-gray-600 mt-0.5">
                By category, trailing 12 months
              </p>
            </div>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setChartMode("stacked")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  chartMode === "stacked"
                    ? "bg-[#41A6AC] text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Stacked
              </button>
              <button
                onClick={() => setChartMode("grouped")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  chartMode === "grouped"
                    ? "bg-[#41A6AC] text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Grouped
              </button>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData}>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: "#6B7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                width={50}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name,
                ]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #E5E7EB",
                  fontSize: "12px",
                }}
              />
              <ReferenceLine
                y={avgMonthlySpending}
                stroke="#9CA3AF"
                strokeDasharray="4 4"
                label={{
                  value: `Avg: ${formatCurrency(avgMonthlySpending)}`,
                  position: "right",
                  fill: "#9CA3AF",
                  fontSize: 11,
                }}
              />
              {expenseCategories.map((cat: any) => (
                <Bar
                  key={cat.name}
                  dataKey={cat.name}
                  stackId={chartMode === "stacked" ? "expenses" : undefined}
                  fill={cat.color}
                  radius={
                    chartMode === "grouped" ? [2, 2, 0, 0] : undefined
                  }
                  maxBarSize={chartMode === "grouped" ? 16 : undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-100">
            {expenseCategories.map((cat: any) => (
              <div key={cat.name} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-xs text-gray-600">{cat.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Income vs Expenses Chart */}
      {incomeExpenseData.some((d: any) => d.Income > 0 || d.Expenses > 0) && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Income vs Expenses
            </h3>
            <p className="text-sm text-gray-600 mt-0.5">
              Monthly cash flow
            </p>
          </div>

          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={incomeExpenseData}>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: "#6B7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                width={50}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name,
                ]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #E5E7EB",
                  fontSize: "12px",
                }}
              />
              <Line
                type="monotone"
                dataKey="Income"
                stroke="#16A34A"
                strokeWidth={2}
                dot={{ r: 3, fill: "#16A34A" }}
              />
              <Line
                type="monotone"
                dataKey="Expenses"
                stroke="#6B7280"
                strokeWidth={2}
                dot={{ r: 3, fill: "#6B7280" }}
              />
              <ReferenceLine y={0} stroke="#E5E7EB" />
            </LineChart>
          </ResponsiveContainer>

          <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-green-600 rounded" />
              <span className="text-xs text-gray-600">Income</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 bg-gray-600 rounded" />
              <span className="text-xs text-gray-600">Expenses</span>
            </div>
          </div>
        </div>
      )}

      {/* Category Trend Cards */}
      {expenseCats.length > 0 && (
        <div className="mb-6">
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Category Trends
            </h3>
            <p className="text-sm text-gray-600 mt-0.5">
              Trailing 12-month patterns by category
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {expenseCats.map((cat: any) => (
              <CategoryTrendCard key={cat.categoryId} cat={cat} months={data?.months || []} />
            ))}
          </div>
        </div>
      )}

      {/* Annualized Budget Table */}
      {expenseCats.some((c: any) => c.budgetLimit) && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              12-Month Budgets
            </h3>
            <p className="text-sm text-gray-600 mt-0.5">
              Monthly budget vs actual trailing 12-month spending
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500">
                    Category
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">
                    Mo. Budget
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">
                    Mo. Avg
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">
                    12-Mo Budget
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">
                    12-Mo Spent
                  </th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">
                    % Used
                  </th>
                  <th className="text-center py-2 pl-3 text-xs font-medium text-gray-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {expenseCats
                  .filter((c: any) => c.budgetLimit)
                  .map((cat: any) => {
                    const pct = cat.annualBudget
                      ? (cat.annualSpent / cat.annualBudget) * 100
                      : 0;
                    const status =
                      pct > 100
                        ? "over"
                        : pct > 80
                          ? "warning"
                          : "good";

                    return (
                      <tr
                        key={cat.categoryId}
                        className="border-b border-gray-50"
                      >
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="font-medium text-gray-900">
                              {cat.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">
                          {formatCurrency(cat.budgetLimit)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">
                          {formatCurrency(cat.monthlyAverage)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">
                          {formatCurrency(cat.annualBudget)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums font-medium text-gray-900">
                          {formatCurrency(cat.annualSpent)}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">
                          {pct.toFixed(1)}%
                        </td>
                        <td className="py-2.5 pl-3 text-center">
                          {status === "over" ? (
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" title="Over budget" />
                          ) : status === "warning" ? (
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500" title="Near budget" />
                          ) : (
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" title="Under budget" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td className="py-2.5 pr-4 font-semibold text-gray-900">
                    Total
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-gray-900">
                    {formatCurrency(
                      expenseCats
                        .filter((c: any) => c.budgetLimit)
                        .reduce((s: number, c: any) => s + c.budgetLimit, 0),
                    )}
                  </td>
                  <td className="py-2.5 px-3" />
                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-gray-900">
                    {formatCurrency(
                      expenseCats
                        .filter((c: any) => c.budgetLimit)
                        .reduce(
                          (s: number, c: any) => s + (c.annualBudget || 0),
                          0,
                        ),
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-gray-900">
                    {formatCurrency(
                      expenseCats
                        .filter((c: any) => c.budgetLimit)
                        .reduce((s: number, c: any) => s + c.annualSpent, 0),
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-gray-900">
                    {(() => {
                      const totalBudget = expenseCats
                        .filter((c: any) => c.budgetLimit)
                        .reduce(
                          (s: number, c: any) => s + (c.annualBudget || 0),
                          0,
                        );
                      const totalSpent = expenseCats
                        .filter((c: any) => c.budgetLimit)
                        .reduce((s: number, c: any) => s + c.annualSpent, 0);
                      return totalBudget > 0
                        ? `${((totalSpent / totalBudget) * 100).toFixed(1)}%`
                        : "—";
                    })()}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && (!data || data.annualSummary.totalSpent === 0) && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-600">
            No transaction data found for the last 12 months.
          </p>
        </div>
      )}
    </div>
  );
}

// Category Trend Card component
function CategoryTrendCard({ cat, months }: { cat: any; months: string[] }) {
  const maxAmount = Math.max(...cat.monthlyAmounts, 1);
  const hasAnomaly = cat.anomalies && cat.anomalies.length > 0;

  const monthLabels = months.map((m) => {
    const [y, mo] = m.split("-");
    return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString("en-US", { month: "narrow" });
  });

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: cat.color }}
          />
          <span className="font-medium text-gray-900 text-sm truncate">
            {cat.name}
          </span>
        </div>
        {hasAnomaly && (
          <div
            className="flex items-center gap-1 text-amber-600"
            title={`Spike: ${cat.anomalies.map((a: any) => `${formatMonthShort(a.month)} (${a.ratio.toFixed(1)}x avg)`).join(", ")}`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Spike</span>
          </div>
        )}
      </div>

      {/* Sparkline - 12 mini bars */}
      <div className="flex items-end gap-0.5 h-12 mb-3">
        {cat.monthlyAmounts.map((amount: number, i: number) => {
          const height = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
          const isAnomaly =
            cat.anomalies?.some((a: any) => a.month === months[i]) || false;

          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all"
              style={{
                height: `${Math.max(height, amount > 0 ? 4 : 0)}%`,
                backgroundColor: isAnomaly
                  ? "#F59E0B"
                  : amount > 0
                    ? cat.color
                    : "#F3F4F6",
                minHeight: amount > 0 ? "2px" : "1px",
              }}
              title={`${formatMonthShort(months[i])}: ${formatCurrency(amount)}`}
            />
          );
        })}
      </div>

      {/* Month labels */}
      <div className="flex gap-0.5 mb-3">
        {monthLabels.map((m, i) => (
          <span
            key={i}
            className="flex-1 text-center text-[9px] text-gray-400"
          >
            {m}
          </span>
        ))}
      </div>

      {/* Stats */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">12-month total</span>
          <span className="font-semibold text-gray-900 tabular-nums">
            {formatCurrency(cat.annualSpent)}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Monthly avg</span>
          <span className="text-gray-700 tabular-nums">
            {formatCurrency(cat.monthlyAverage)}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Active months</span>
          <span className="text-gray-700">
            {cat.monthsActive} of 12
          </span>
        </div>

        {/* Annual budget progress bar */}
        {cat.annualBudget && (
          <div className="pt-1.5">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500">12-month budget</span>
              <span className="text-gray-700 tabular-nums">
                {formatCurrency(cat.annualSpent)} / {formatCurrency(cat.annualBudget)}
              </span>
            </div>
            <div
              className="w-full rounded-full h-1.5 overflow-hidden"
              style={{ backgroundColor: `${cat.color}20` }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min((cat.annualSpent / cat.annualBudget) * 100, 100)}%`,
                  backgroundColor:
                    cat.annualSpent > cat.annualBudget ? "#EF4444" : cat.color,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatMonthShort(monthStr: string): string {
  const [y, m] = monthStr.split("-");
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en-US", {
    month: "short",
  });
}
