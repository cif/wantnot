import type { Route } from "./+types/home";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { AppLayout } from "~/components/AppLayout";
import { useAuth } from "~/contexts/AuthContext";
import { PlaidLinkButton } from "~/components/PlaidLinkButton";
import { useState, useEffect } from "react";

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categorizingId, setCategorizingId] = useState<string | null>(null);
  const [taggingProjectId, setTaggingProjectId] = useState<string | null>(null);

  // Fetch accounts and transactions
  const fetchData = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const [accountsRes, transactionsRes, categoriesRes, projectsRes] = await Promise.all([
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
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Refresh transactions
  const handleRefreshTransactions = async () => {
    setRefreshing(true);
    setErrorMessage(null);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch('/api/plaid/sync-transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error('Failed to refresh transactions');

      const data = await response.json();
      setSuccessMessage(`Synced transactions for ${data.totalAccounts} account(s)`);

      // Refresh the data
      await fetchData();
    } catch (error) {
      console.error('Error refreshing transactions:', error);
      setErrorMessage('Failed to refresh transactions');
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
                    ${parseFloat(account.currentBalance).toFixed(2)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Uncategorized Transactions */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Needs Categorization</h2>
            <p className="text-sm text-gray-600 mt-1">
              {transactions.filter(txn => !txn.categoryId).length} uncategorized transaction{transactions.filter(txn => !txn.categoryId).length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={handleRefreshTransactions}
            disabled={refreshing || accounts.length === 0}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="text-gray-600">Loading...</div>
        ) : transactions.filter(txn => !txn.categoryId).length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <svg className="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-900 font-semibold mb-1">All caught up!</p>
            <p className="text-gray-600 text-sm">All your transactions have been categorized.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-200">
              {transactions.filter(txn => !txn.categoryId).map((txn) => {
                const category = categories.find(c => c.id === txn.categoryId);
                const project = projects.find(p => p.id === txn.projectId);
                return (
                  <div key={txn.id} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{txn.merchantName || txn.name}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-sm text-gray-500">
                            {new Date(txn.date).toLocaleDateString()}
                          </p>
                          {txn.pending && (
                            <span className="text-xs px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded">
                              Pending
                            </span>
                          )}
                          {txn.autoCategorizationMethod && txn.autoCategorizationMethod !== 'manual' && (
                            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                              Auto: {txn.autoCategorizationMethod}
                              {txn.autoCategorizationConfidence &&
                                ` (${Math.round(txn.autoCategorizationConfidence * 100)}%)`
                              }
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <select
                            value={txn.categoryId || ''}
                            onChange={(e) => handleCategorize(txn.id, e.target.value || null)}
                            disabled={categorizingId === txn.id}
                            className="px-3 py-1.5 text-sm bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#41A6AC] focus:border-transparent disabled:opacity-50 pr-8"
                          >
                            <option value="">Uncategorized</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                          {categorizingId === txn.id && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                              <svg className="animate-spin h-4 w-4 text-[#41A6AC]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            </div>
                          )}
                        </div>

                        <div className="relative">
                          <select
                            value={txn.projectId || ''}
                            onChange={(e) => handleTagProject(txn.id, e.target.value || null)}
                            disabled={taggingProjectId === txn.id}
                            className="px-3 py-1.5 text-sm bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#41A6AC] focus:border-transparent disabled:opacity-50 pr-8"
                          >
                            <option value="">No project</option>
                            {projects.map((proj) => (
                              <option key={proj.id} value={proj.id}>
                                {proj.name}
                              </option>
                            ))}
                          </select>
                          {taggingProjectId === txn.id && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                              <svg className="animate-spin h-4 w-4 text-[#41A6AC]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            </div>
                          )}
                        </div>

                        <div className="text-right min-w-[80px]">
                          <p className={`font-semibold ${parseFloat(txn.amount) < 0 ? 'text-green-600' : 'text-gray-700'}`}>
                            {parseFloat(txn.amount) < 0 ? '+' : '-'}${Math.abs(parseFloat(txn.amount)).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {(category || project) && (
                      <div className="mt-2 flex items-center gap-4">
                        {category && (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            <span className="text-xs text-gray-600">{category.name}</span>
                          </div>
                        )}
                        {project && (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                            <span className="text-xs text-gray-600">{project.name}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
