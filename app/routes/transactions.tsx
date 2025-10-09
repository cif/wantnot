import type { Route } from "./+types/transactions";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { AppLayout } from "~/components/AppLayout";
import { useAuth } from "~/contexts/AuthContext";
import { TransactionCategorySelect } from "~/components/TransactionCategorySelect";
import { TransactionProjectSelect } from "~/components/TransactionProjectSelect";
import { useState, useEffect, useMemo } from "react";
import { EyeOff, Eye, ArrowLeftRight, X, RefreshCw } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Transactions - WantNot" },
    { name: "description", content: "View and manage your transactions" },
  ];
}

export default function Transactions() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <TransactionsPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function TransactionsPage() {
  const { getIdToken } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categorizingId, setCategorizingId] = useState<string | null>(null);
  const [taggingProjectId, setTaggingProjectId] = useState<string | null>(null);
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>('');
  const [showHidden, setShowHidden] = useState(false);
  const [hidingId, setHidingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [allUncategorized, setAllUncategorized] = useState<any[]>([]);

  // Fetch transactions for selected month
  const fetchTransactionsForMonth = async (monthYear: string) => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch(`/api/transactions/by-month?month=${monthYear}&includeHidden=${showHidden}`, {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  // Fetch initial data
  const fetchData = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const [categoriesRes, projectsRes, uncategorizedRes] = await Promise.all([
        fetch('/api/categories', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
        fetch('/api/projects', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
        fetch('/api/transactions/uncategorized', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
      ]);

      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data.categories || []);
      }

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setProjects(data.projects || []);
      }

      if (uncategorizedRes.ok) {
        const data = await uncategorizedRes.json();
        setAllUncategorized(data.transactions || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Generate available month/year options from both transactions and allUncategorized
  const monthYearOptions = useMemo(() => {
    const options = new Set<string>();
    // Add months from recent 100 transactions
    transactions.forEach(txn => {
      const date = new Date(txn.date);
      const monthYear = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      options.add(monthYear);
    });
    // Also add months from all uncategorized transactions (so older months appear)
    allUncategorized.forEach(txn => {
      const date = new Date(txn.date);
      const monthYear = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      options.add(monthYear);
    });
    return Array.from(options).sort().reverse(); // Most recent first
  }, [transactions, allUncategorized]);

  // Set default to most recent month if not set
  useEffect(() => {
    if (!selectedMonthYear && monthYearOptions.length > 0) {
      setSelectedMonthYear(monthYearOptions[0]);
    }
  }, [monthYearOptions]);

  // Fetch transactions when selected month or showHidden changes
  useEffect(() => {
    if (selectedMonthYear) {
      fetchTransactionsForMonth(selectedMonthYear);
    }
  }, [selectedMonthYear, showHidden]);

  // Transactions are already filtered by month and hidden status from the API
  const filteredTransactions = transactions;

  // Format month/year for display
  const formatMonthYear = (monthYear: string) => {
    if (!monthYear) return '';
    const [year, month] = monthYear.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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

      // Remove from allUncategorized after a brief delay to allow fade animation
      setTimeout(() => {
        setAllUncategorized(allUncategorized.filter(txn => txn.id !== transactionId));
      }, 150);

      // Notify AppLayout to refresh badge count
      window.dispatchEvent(new Event('transaction-updated'));

      setSuccessMessage('Transaction categorized!');
      setTimeout(() => setSuccessMessage(null), 2000);
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

      // Also update allUncategorized
      setAllUncategorized(allUncategorized.map(txn =>
        txn.id === transactionId
          ? { ...txn, projectId }
          : txn
      ));

      setSuccessMessage('Transaction tagged!');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (error) {
      console.error('Error tagging transaction with project:', error);
      setErrorMessage('Failed to tag transaction');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setTaggingProjectId(null);
    }
  };

  const handleToggleHidden = async (transactionId: string, currentHiddenState: boolean) => {
    try {
      setHidingId(transactionId);
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ isHidden: !currentHiddenState }),
      });

      if (!response.ok) throw new Error('Failed to update transaction');

      // Update local state
      setTransactions(transactions.map(txn =>
        txn.id === transactionId
          ? { ...txn, isHidden: !currentHiddenState }
          : txn
      ));

      // Also update allUncategorized state
      if (!currentHiddenState) {
        // If hiding, remove from allUncategorized
        setAllUncategorized(allUncategorized.filter(txn => txn.id !== transactionId));
      } else {
        // If unhiding, we need to check if it should be in the list
        // For simplicity, just refetch the uncategorized list
        const idToken = await getIdToken();
        if (idToken) {
          const response = await fetch('/api/transactions/uncategorized', {
            headers: { 'Authorization': `Bearer ${idToken}` },
          });
          if (response.ok) {
            const data = await response.json();
            setAllUncategorized(data.transactions || []);
          }
        }
      }

      // Notify AppLayout to refresh badge count
      window.dispatchEvent(new Event('transaction-updated'));

      setSuccessMessage(currentHiddenState ? 'Transaction unhidden!' : 'Transaction hidden!');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (error) {
      console.error('Error hiding transaction:', error);
      setErrorMessage('Failed to update transaction');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setHidingId(null);
    }
  };

  const handleRefreshTransactions = async () => {
    try {
      setIsRefreshing(true);
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch('/api/transactions/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!response.ok) throw new Error('Failed to sync transactions');

      // Refresh data after sync
      await fetchData();
      setSuccessMessage('Transactions synced successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error syncing transactions:', error);
      setErrorMessage('Failed to sync transactions');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };


  // Calculate totals for the selected month (excluding transfers)
  const monthTotals = useMemo(() => {
    // Exclude transfers from calculations
    const nonTransfers = filteredTransactions.filter(txn => !txn.isTransfer);

    const posted = nonTransfers.filter(txn => !txn.pending);
    const pending = nonTransfers.filter(txn => txn.pending);

    const income = posted
      .filter(txn => parseFloat(txn.amount) < 0)
      .reduce((sum, txn) => sum + Math.abs(parseFloat(txn.amount)), 0);

    const expenses = posted
      .filter(txn => parseFloat(txn.amount) > 0)
      .reduce((sum, txn) => sum + parseFloat(txn.amount), 0);

    const pendingIncome = pending
      .filter(txn => parseFloat(txn.amount) < 0)
      .reduce((sum, txn) => sum + Math.abs(parseFloat(txn.amount)), 0);

    const pendingExpenses = pending
      .filter(txn => parseFloat(txn.amount) > 0)
      .reduce((sum, txn) => sum + parseFloat(txn.amount), 0);

    return {
      income,
      expenses,
      net: income - expenses,
      pendingIncome,
      pendingExpenses,
      hasPending: pending.length > 0
    };
  }, [filteredTransactions]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Header with Month/Year Filter */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHidden(!showHidden)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showHidden
                ? 'bg-[#41A6AC] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title={showHidden ? 'Hide hidden transactions' : 'Show hidden transactions'}
          >
            {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span>{showHidden ? 'Showing' : 'Hiding'} Hidden</span>
          </button>

          {monthYearOptions.length > 0 && (
            <select
              value={selectedMonthYear}
              onChange={(e) => setSelectedMonthYear(e.target.value)}
              className="px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#41A6AC] focus:border-transparent"
            >
              {monthYearOptions.map(monthYear => (
                <option key={monthYear} value={monthYear}>
                  {formatMonthYear(monthYear)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Month Summary Stats */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Income</p>
          <p className="text-lg font-bold text-green-600">+${monthTotals.income.toFixed(2)}</p>
          {monthTotals.hasPending && monthTotals.pendingIncome > 0 && (
            <p className="text-xs text-yellow-600 mt-0.5">+${monthTotals.pendingIncome.toFixed(2)} pending</p>
          )}
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Expenses</p>
          <p className="text-lg font-bold text-gray-700">-${monthTotals.expenses.toFixed(2)}</p>
          {monthTotals.hasPending && monthTotals.pendingExpenses > 0 && (
            <p className="text-xs text-yellow-600 mt-0.5">-${monthTotals.pendingExpenses.toFixed(2)} pending</p>
          )}
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Net</p>
          <p className={`text-lg font-bold ${monthTotals.net >= 0 ? 'text-green-600' : 'text-gray-700'}`}>
            {monthTotals.net >= 0 ? '+' : '-'}${Math.abs(monthTotals.net).toFixed(2)}
          </p>
          {monthTotals.hasPending && (
            <p className="text-xs text-yellow-600 mt-0.5">
              {(monthTotals.pendingIncome - monthTotals.pendingExpenses) >= 0 ? '+' : '-'}
              ${Math.abs(monthTotals.pendingIncome - monthTotals.pendingExpenses).toFixed(2)} pending
            </p>
          )}
        </div>
      </div>

      {/* Needs Categorization Section */}
      {allUncategorized.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Needs Categorization</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                {allUncategorized.length} transaction{allUncategorized.length !== 1 ? 's' : ''} need{allUncategorized.length === 1 ? 's' : ''} a category
              </p>
            </div>
            <button
              onClick={handleRefreshTransactions}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-[#41A6AC] text-white rounded-lg hover:bg-[#35858a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="font-medium">{isRefreshing ? 'Syncing...' : 'Sync Transactions'}</span>
            </button>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-4">
            <div className="divide-y divide-gray-100">
              {allUncategorized.slice(0, 10).map((txn) => {
                const project = projects.find(p => p.id === txn.projectId);
                const isBeingCategorized = categorizingId === txn.id;
                return (
                  <div
                    key={txn.id}
                    className={`p-3 hover:bg-gray-50 transition-all duration-300 ${isBeingCategorized ? 'opacity-50' : 'opacity-100'}`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Date */}
                      <div
                        className="w-14 flex-shrink-0 cursor-pointer"
                        onClick={() => window.location.href = `/transactions/${txn.id}`}
                      >
                        <p className="text-xs font-medium text-gray-900">
                          {new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>

                      {/* Transaction Info */}
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => window.location.href = `/transactions/${txn.id}`}
                      >
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {txn.merchantName || txn.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {project && (
                            <div className="flex items-center gap-1">
                              <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: project.color }}
                              />
                              <span className="text-xs text-gray-600">{project.name}</span>
                            </div>
                          )}
                          {txn.pending && (
                            <span className="text-xs px-1.5 py-0.5 bg-yellow-50 text-yellow-700 rounded">
                              Pending
                            </span>
                          )}
                          {txn.isTransfer && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded flex items-center gap-1">
                              <ArrowLeftRight className="w-3 h-3" />
                              Transfer
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Category Dropdown */}
                      <div className="relative w-32 flex-shrink-0">
                        <TransactionCategorySelect
                          transaction={txn}
                          categories={categories}
                          onCategorize={handleCategorize}
                          isLoading={categorizingId === txn.id}
                        />
                      </div>

                      {/* Project Dropdown */}
                      <div className="relative w-28 flex-shrink-0">
                        <TransactionProjectSelect
                          transaction={txn}
                          projects={projects}
                          onTagProject={handleTagProject}
                          isLoading={taggingProjectId === txn.id}
                        />
                      </div>

                      {/* Amount */}
                      <div className="w-24 text-right flex-shrink-0">
                        <p className={`text-sm font-semibold ${parseFloat(txn.amount) < 0 ? 'text-green-600' : 'text-gray-700'}`}>
                          {parseFloat(txn.amount) < 0 ? '+' : '-'}${Math.abs(parseFloat(txn.amount)).toFixed(2)}
                        </p>
                      </div>

                      {/* Hide Button */}
                      <button
                        onClick={() => handleToggleHidden(txn.id, txn.isHidden)}
                        disabled={hidingId === txn.id}
                        className="ml-2 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                        title="Hide transaction"
                      >
                        {hidingId === txn.id ? (
                          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {allUncategorized.length > 10 && (
            <p className="text-sm text-gray-600 text-center mb-4">
              +{allUncategorized.length - 10} more transactions need categorization
            </p>
          )}
        </div>
      )}

      {/* Transactions Table */}
      {loading ? (
        <div className="text-gray-600 text-center py-8">Loading...</div>
      ) : filteredTransactions.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-600">No transactions found for this period.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {filteredTransactions.map((txn) => {
              const category = categories.find(c => c.id === txn.categoryId);
              const project = projects.find(p => p.id === txn.projectId);

              return (
                <div key={txn.id} className="p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    {/* Date */}
                    <div
                      className="w-14 flex-shrink-0 cursor-pointer"
                      onClick={() => window.location.href = `/transactions/${txn.id}`}
                    >
                      <p className="text-xs font-medium text-gray-900">
                        {new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>

                    {/* Transaction Info */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => window.location.href = `/transactions/${txn.id}`}
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {txn.merchantName || txn.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {category && (
                          <div className="flex items-center gap-1">
                            <div
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            <span className="text-xs text-gray-600">{category.name}</span>
                          </div>
                        )}
                        {project && (
                          <div className="flex items-center gap-1">
                            <div
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                            <span className="text-xs text-gray-600">{project.name}</span>
                          </div>
                        )}
                        {txn.pending && (
                          <span className="text-xs px-1.5 py-0.5 bg-yellow-50 text-yellow-700 rounded">
                            Pending
                          </span>
                        )}
                        {txn.isTransfer && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded flex items-center gap-1">
                            <ArrowLeftRight className="w-3 h-3" />
                            Transfer
                          </span>
                        )}
                        {txn.isHidden && (
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded flex items-center gap-1">
                            <EyeOff className="w-3 h-3" />
                            Hidden
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Category Dropdown */}
                    <div className="relative w-32 flex-shrink-0">
                      <TransactionCategorySelect
                        transaction={txn}
                        categories={categories}
                        onCategorize={handleCategorize}
                        isLoading={categorizingId === txn.id}
                      />
                    </div>

                    {/* Project Dropdown */}
                    <div className="relative w-28 flex-shrink-0">
                      <TransactionProjectSelect
                        transaction={txn}
                        projects={projects}
                        onTagProject={handleTagProject}
                        isLoading={taggingProjectId === txn.id}
                      />
                    </div>

                    {/* Amount */}
                    <div className="w-24 text-right flex-shrink-0">
                      <p className={`text-sm font-semibold ${parseFloat(txn.amount) < 0 ? 'text-green-600' : 'text-gray-700'}`}>
                        {parseFloat(txn.amount) < 0 ? '+' : '-'}${Math.abs(parseFloat(txn.amount)).toFixed(2)}
                      </p>
                    </div>

                    {/* Hide/Unhide Button */}
                    <button
                      onClick={() => handleToggleHidden(txn.id, txn.isHidden)}
                      disabled={hidingId === txn.id}
                      className="ml-2 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                      title={txn.isHidden ? 'Unhide transaction' : 'Hide transaction'}
                    >
                      {hidingId === txn.id ? (
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      ) : txn.isHidden ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
