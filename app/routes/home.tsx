import type { Route } from "./+types/home";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { AppLayout } from "~/components/AppLayout";
import { useAuth } from "~/contexts/AuthContext";
import { PlaidLinkButton } from "~/components/PlaidLinkButton";
import { useState, useEffect } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Transactions - WantNot" },
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch accounts and transactions
  const fetchData = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const [accountsRes, transactionsRes] = await Promise.all([
        fetch('/api/accounts', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
        fetch('/api/transactions', {
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

      {/* Transactions */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold text-gray-900">Recent Transactions</h2>
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
        ) : transactions.length === 0 ? (
          <p className="text-gray-600">No transactions yet.</p>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-200">
              {transactions.map((txn) => (
                <div key={txn.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-900">{txn.merchantName || txn.name}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(txn.date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${parseFloat(txn.amount) < 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {parseFloat(txn.amount) < 0 ? '+' : '-'}${Math.abs(parseFloat(txn.amount)).toFixed(2)}
                    </p>
                    {txn.pending && (
                      <span className="text-xs text-yellow-600">Pending</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
