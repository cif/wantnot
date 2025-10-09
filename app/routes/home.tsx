import type { Route } from "./+types/home";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { AppLayout } from "~/components/AppLayout";
import { useAuth } from "~/contexts/AuthContext";
import { PlaidLinkButton } from "~/components/PlaidLinkButton";
import { TransactionCategorySelect } from "~/components/TransactionCategorySelect";
import { TransactionProjectSelect } from "~/components/TransactionProjectSelect";
import { useState, useEffect } from "react";
import { Link } from "react-router";
import { formatCurrency, formatMonthYear, formatPercent } from "~/lib/format";
import { AlertCircle, CreditCard } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dashboard - WantNot" },
    { name: "description", content: "Financial budgeting and expense tracking" },
  ];
}

export default function Home() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <AuthenticatedHome />
      </AppLayout>
    </ProtectedRoute>
  );
}

function AuthenticatedHome() {
  const { user, getIdToken } = useAuth();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categorizingId, setCategorizingId] = useState<string | null>(null);
  const [taggingProjectId, setTaggingProjectId] = useState<string | null>(null);

  // Fetch accounts and transactions
  const fetchData = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      // Calculate current and prior month
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const priorMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const priorMonth = `${priorMonthDate.getUTCFullYear()}-${String(priorMonthDate.getUTCMonth() + 1).padStart(2, '0')}`;

      const [accountsRes, transactionsRes, categoriesRes, projectsRes, currentBudgetRes, priorBudgetRes] = await Promise.all([
        fetch('/api/accounts', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
        fetch('/api/transactions', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
        fetch('/api/categories', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
        fetch('/api/projects', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
        fetch(`/api/budget/summary?month=${currentMonth}`, {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
        fetch(`/api/budget/summary?month=${priorMonth}`, {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
      ]);

      if (accountsRes.ok) {
        const data = await accountsRes.json();
        setAccounts(data.accounts || []);
      }

      if (transactionsRes.ok) {
        const data = await transactionsRes.json();
        setTransactions(data.transactions || []);
      }

      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data.categories || []);
      }

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setProjects(data.projects || []);
      }

      if (currentBudgetRes.ok && priorBudgetRes.ok) {
        const currentData = await currentBudgetRes.json();
        const priorData = await priorBudgetRes.json();

        // Merge the two months' data
        const allCategoryIds = new Set([
          ...currentData.summary.map((s: any) => s.categoryId),
          ...priorData.summary.map((s: any) => s.categoryId),
        ]);

        const mergedSummary = Array.from(allCategoryIds).map(categoryId => {
          const current = currentData.summary.find((s: any) => s.categoryId === categoryId);
          const prior = priorData.summary.find((s: any) => s.categoryId === categoryId);

          return {
            categoryId,
            categoryName: current?.categoryName || prior?.categoryName || 'Uncategorized',
            categoryColor: current?.categoryColor || prior?.categoryColor || '#6B7280',
            budgetLimit: current?.budgetLimit || prior?.budgetLimit || null,
            spent: current?.spent || 0,
            priorSpent: prior?.spent || 0,
            transactionCount: current?.transactionCount || 0,
            percentOfBudget: current?.percentOfBudget || null,
          };
        }).sort((a, b) => a.categoryName.localeCompare(b.categoryName));

        const totalPriorSpent = priorData.totals.spent;
        const totalSpent = currentData.totals.spent;
        const change = totalPriorSpent > 0 ? ((totalSpent - totalPriorSpent) / totalPriorSpent) * 100 : 0;

        setBudgetSummary({
          month: currentData.month,
          priorMonth: priorData.month,
          startDate: currentData.startDate,
          endDate: currentData.endDate,
          priorStartDate: priorData.startDate,
          priorEndDate: priorData.endDate,
          summary: mergedSummary,
          totals: {
            spent: totalSpent,
            priorSpent: totalPriorSpent,
            budgeted: currentData.totals.budgeted,
            unbudgeted: currentData.totals.unbudgeted,
            priorBudgeted: priorData.totals.budgeted,
            priorUnbudgeted: priorData.totals.unbudgeted,
            change,
            budget: currentData.totals.budget,
            percentOfBudget: currentData.totals.percentOfBudget,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Refresh transactions and balances
  const handleRefreshTransactions = async () => {
    setRefreshing(true);
    setErrorMessage(null);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      // Refresh both balances and transactions in parallel
      const [balancesRes, transactionsRes] = await Promise.all([
        fetch('/api/accounts/refresh-balances', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({}),
        }),
        fetch('/api/plaid/sync-transactions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({}),
        }),
      ]);

      if (!transactionsRes.ok) throw new Error('Failed to refresh transactions');

      const transactionsData = await transactionsRes.json();
      const balancesData = balancesRes.ok ? await balancesRes.json() : null;

      setSuccessMessage(
        `Synced transactions for ${transactionsData.totalAccounts} account(s)` +
        (balancesData ? ` and refreshed ${balancesData.refreshed} balance(s)` : '')
      );

      // Refresh the data
      await fetchData();
    } catch (error) {
      console.error('Error refreshing data:', error);
      setErrorMessage('Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const handlePlaidSuccess = async (publicToken: string, metadata: any) => {
    try {
      setErrorMessage(null);
      setSuccessMessage(null);

      const idToken = await getIdToken();
      if (!idToken) {
        throw new Error('Failed to get authentication token');
      }

      const response = await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          publicToken,
          metadata,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to connect account');
      }

      const data = await response.json();
      setSuccessMessage(data.message || 'Bank account connected successfully!');

      // Refresh data to show new accounts
      await fetchData();
    } catch (error) {
      console.error('Error exchanging token:', error);
      setErrorMessage('Failed to connect bank account. Please try again.');
    }
  };

  const handlePlaidError = (error: any) => {
    console.error('Plaid Link error:', error);
    setErrorMessage('An error occurred with Plaid Link. Please try again.');
  };

  const handleCategorize = async (transactionId: string, categoryId: string | null) => {
    try {
      setCategorizingId(transactionId);
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch(`/api/transactions/${transactionId}/categorize`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ categoryId }),
      });

      if (!response.ok) throw new Error('Failed to categorize transaction');

      // Update local state
      setTransactions(transactions.map(txn =>
        txn.id === transactionId
          ? { ...txn, categoryId, autoCategorizationMethod: 'manual', autoCategorizationConfidence: 1.0 }
          : txn
      ));

      setSuccessMessage('Transaction categorized!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error categorizing transaction:', error);
      setErrorMessage('Failed to categorize transaction');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setCategorizingId(null);
    }
  };

  const handleTagProject = async (transactionId: string, projectId: string | null) => {
    try {
      setTaggingProjectId(transactionId);
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch(`/api/transactions/${transactionId}/tag-project`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ projectId }),
      });

      if (!response.ok) throw new Error('Failed to tag transaction with project');

      // Update local state
      setTransactions(transactions.map(txn =>
        txn.id === transactionId
          ? { ...txn, projectId }
          : txn
      ));

      setSuccessMessage('Transaction tagged with project!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error tagging transaction with project:', error);
      setErrorMessage('Failed to tag transaction with project');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setTaggingProjectId(null);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {errorMessage}
        </div>
      )}

      {/* Connected Accounts */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-gray-900">Connected Accounts</h2>
          <PlaidLinkButton
            onSuccess={handlePlaidSuccess}
            onError={handlePlaidError}
          />
        </div>

        {loading ? (
          <div className="text-gray-600">Loading...</div>
        ) : accounts.length === 0 ? (
          <p className="text-gray-600">No accounts connected yet. Click the button above to get started!</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <div key={account.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{account.name}</h3>
                    {account.mask && (
                      <p className="text-sm text-gray-500">••••{account.mask}</p>
                    )}
                  </div>
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                    {account.type}
                  </span>
                </div>
                {account.currentBalance && (
                  <p className="text-2xl font-bold text-gray-900 mt-4">
                    {formatCurrency(account.currentBalance)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Budget Summary */}
      {budgetSummary && budgetSummary.summary.length > 0 && (
        <div className="mb-8">
          <div className="mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">Budget Summary</h2>
            <p className="text-sm text-gray-600 mt-1">
              Spending by category for {formatMonthYear(budgetSummary.startDate)}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {/* Totals */}
            <div className="grid grid-cols-2 gap-6 mb-6 pb-6 border-b border-gray-200">
              <div>
                <p className="text-sm text-gray-600 mb-1">Last Month</p>
                <p className="text-3xl font-bold text-gray-500">
                  {formatCurrency(budgetSummary.totals.priorSpent)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">This Month</p>
                <p className="text-3xl font-bold text-gray-900">
                  {formatCurrency(budgetSummary.totals.spent)}
                </p>
                {budgetSummary.totals.change != null && budgetSummary.totals.change !== 0 && (
                  <p className={`text-xs mt-1 ${budgetSummary.totals.change > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {budgetSummary.totals.change > 0 ? '+' : ''}{budgetSummary.totals.change.toFixed(1)}% vs last month
                  </p>
                )}
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="divide-y divide-gray-200">
              {budgetSummary.summary
                .filter((item: any) => item.budgetLimit)
                .map((item: any, index: number, array: any[]) => {
                  const priorPercent = (item.priorSpent / parseFloat(item.budgetLimit)) * 100;

                  return (
                    <div key={item.categoryId || 'uncategorized'} className={index === 0 ? 'pb-4' : 'py-4'}>
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.categoryColor }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm">{item.categoryName}</p>
                        </div>
                      </div>

                      {/* Side by side progress bars */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Prior Month */}
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Last Month: {formatCurrency(item.priorSpent)}</p>
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all opacity-50"
                              style={{
                                width: `${Math.min(priorPercent, 100)}%`,
                                backgroundColor: item.categoryColor
                              }}
                            />
                          </div>
                        </div>

                        {/* Current Month */}
                        <div>
                          <p className="text-xs text-gray-900 font-medium mb-1">This Month: {formatCurrency(item.spent)}</p>
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(item.percentOfBudget || 0, 100)}%`,
                                backgroundColor: item.categoryColor
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {item.percentOfBudget > 100 ? (
                        <div className="flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3 text-red-600 flex-shrink-0" />
                          <p className="text-xs text-red-600">
                            {formatCurrency(item.spent - parseFloat(item.budgetLimit))} over budget
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs mt-1 text-gray-500">
                          {formatPercent(item.percentOfBudget || 0)} of {formatCurrency(item.budgetLimit)} budget
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Total Progress Bars */}
            {budgetSummary.totals.budget && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">Total Budget</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Prior Month Total */}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">
                      {formatCurrency(budgetSummary.totals.priorBudgeted || 0)}
                      {budgetSummary.totals.priorUnbudgeted > 0 && (
                        <span className="text-gray-400"> (+{formatCurrency(budgetSummary.totals.priorUnbudgeted)}, unbudgeted)</span>
                      )}
                    </p>
                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gray-400 opacity-50 transition-all"
                        style={{
                          width: `${Math.min((budgetSummary.totals.priorSpent / budgetSummary.totals.budget) * 100, 100)}%`
                        }}
                      />
                    </div>
                  </div>

                  {/* Current Month Total */}
                  <div>
                    <p className="text-xs text-gray-900 font-medium mb-1">
                      {formatCurrency(budgetSummary.totals.budgeted || 0)}
                      {budgetSummary.totals.unbudgeted > 0 && (
                        <span className="text-gray-600"> (+{formatCurrency(budgetSummary.totals.unbudgeted)}, unbudgeted)</span>
                      )}
                    </p>
                    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          budgetSummary.totals.percentOfBudget > 100 ? 'bg-red-500' :
                          budgetSummary.totals.percentOfBudget > 80 ? 'bg-yellow-500' :
                          'bg-[#41A6AC]'
                        }`}
                        style={{
                          width: `${Math.min(budgetSummary.totals.percentOfBudget, 100)}%`
                        }}
                      />
                    </div>
                  </div>
                </div>

                <p className={`text-xs mt-1 ${budgetSummary.totals.percentOfBudget > 100 ? 'text-red-600' : 'text-gray-500'}`}>
                  {formatPercent(budgetSummary.totals.percentOfBudget)} of {formatCurrency(budgetSummary.totals.budget)} total budget
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/transactions"
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:border-[#41A6AC] transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Transactions</h3>
              <p className="text-sm text-gray-600">
                {transactions.filter(txn => !txn.categoryId && !txn.isHidden && !txn.pending && !txn.isTransfer).length > 0 ? (
                  <span>
                    <span className="font-semibold text-[#41A6AC]">
                      {transactions.filter(txn => !txn.categoryId && !txn.isHidden && !txn.pending && !txn.isTransfer).length}
                    </span> need categorization
                  </span>
                ) : (
                  'All caught up!'
                )}
              </p>
            </div>
            <CreditCard className="w-8 h-8 text-[#41A6AC]" />
          </div>
        </Link>

        <button
          onClick={handleRefreshTransactions}
          disabled={refreshing || accounts.length === 0}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:border-[#41A6AC] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {refreshing ? 'Syncing...' : 'Sync Transactions'}
              </h3>
              <p className="text-sm text-gray-600">
                Refresh from connected accounts
              </p>
            </div>
            <svg className={`w-8 h-8 text-[#41A6AC] ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}
