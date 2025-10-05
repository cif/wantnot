import type { Route } from "./+types/transactions";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { AppLayout } from "~/components/AppLayout";
import { useAuth } from "~/contexts/AuthContext";
import { useState, useEffect, useMemo } from "react";

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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch transactions and other data
  const fetchData = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const [transactionsRes, categoriesRes, projectsRes] = await Promise.all([
        fetch('/api/transactions', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
        fetch('/api/categories', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
        fetch('/api/projects', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
      ]);

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
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Generate available month/year options from transactions
  const monthYearOptions = useMemo(() => {
    const options = new Set<string>();
    transactions.forEach(txn => {
      const date = new Date(txn.date);
      const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      options.add(monthYear);
    });
    return Array.from(options).sort().reverse(); // Most recent first
  }, [transactions]);

  // Set default to most recent month if not set
  useEffect(() => {
    if (!selectedMonthYear && monthYearOptions.length > 0) {
      setSelectedMonthYear(monthYearOptions[0]);
    }
  }, [monthYearOptions]);

  // Filter transactions by selected month/year
  const filteredTransactions = useMemo(() => {
    if (!selectedMonthYear) return transactions;

    return transactions.filter(txn => {
      const date = new Date(txn.date);
      const txnMonthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return txnMonthYear === selectedMonthYear;
    });
  }, [transactions, selectedMonthYear]);

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

  // Calculate totals for the selected month
  const monthTotals = useMemo(() => {
    const income = filteredTransactions
      .filter(txn => parseFloat(txn.amount) < 0)
      .reduce((sum, txn) => sum + Math.abs(parseFloat(txn.amount)), 0);

    const expenses = filteredTransactions
      .filter(txn => parseFloat(txn.amount) > 0)
      .reduce((sum, txn) => sum + parseFloat(txn.amount), 0);

    return { income, expenses, net: income - expenses };
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
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Expenses</p>
          <p className="text-lg font-bold text-gray-700">-${monthTotals.expenses.toFixed(2)}</p>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Net</p>
          <p className={`text-lg font-bold ${monthTotals.net >= 0 ? 'text-green-600' : 'text-gray-700'}`}>
            {monthTotals.net >= 0 ? '+' : '-'}${Math.abs(monthTotals.net).toFixed(2)}
          </p>
        </div>
      </div>

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
                    <div className="w-14 flex-shrink-0">
                      <p className="text-xs font-medium text-gray-900">
                        {new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>

                    {/* Transaction Info */}
                    <div className="flex-1 min-w-0">
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
                      </div>
                    </div>

                    {/* Category Dropdown */}
                    <div className="relative w-32 flex-shrink-0">
                      <select
                        value={txn.categoryId || ''}
                        onChange={(e) => handleCategorize(txn.id, e.target.value || null)}
                        disabled={categorizingId === txn.id}
                        className="w-full px-2 py-1 text-xs bg-white text-gray-900 border border-gray-300 rounded focus:ring-1 focus:ring-[#41A6AC] focus:border-transparent disabled:opacity-50"
                      >
                        <option value="">Uncategorized</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                      {categorizingId === txn.id && (
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                          <svg className="animate-spin h-3 w-3 text-[#41A6AC]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Project Dropdown */}
                    <div className="relative w-28 flex-shrink-0">
                      <select
                        value={txn.projectId || ''}
                        onChange={(e) => handleTagProject(txn.id, e.target.value || null)}
                        disabled={taggingProjectId === txn.id}
                        className="w-full px-2 py-1 text-xs bg-white text-gray-900 border border-gray-300 rounded focus:ring-1 focus:ring-[#41A6AC] focus:border-transparent disabled:opacity-50"
                      >
                        <option value="">No project</option>
                        {projects.map((proj) => (
                          <option key={proj.id} value={proj.id}>
                            {proj.name}
                          </option>
                        ))}
                      </select>
                      {taggingProjectId === txn.id && (
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                          <svg className="animate-spin h-3 w-3 text-[#41A6AC]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="w-24 text-right flex-shrink-0">
                      <p className={`text-sm font-semibold ${parseFloat(txn.amount) < 0 ? 'text-green-600' : 'text-gray-700'}`}>
                        {parseFloat(txn.amount) < 0 ? '+' : '-'}${Math.abs(parseFloat(txn.amount)).toFixed(2)}
                      </p>
                    </div>
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
