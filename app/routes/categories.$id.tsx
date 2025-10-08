import type { Route } from "./+types/categories.$id";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { AppLayout } from "~/components/AppLayout";
import { useAuth } from "~/contexts/AuthContext";
import { useState, useEffect, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { Edit2, Trash2, ArrowLeft } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Edit Category - WantNot" },
    { name: "description", content: "Edit category and view transactions" },
  ];
}

export default function CategoryDetail() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <CategoryDetailPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function CategoryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getIdToken } = useAuth();
  const [category, setCategory] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', budgetLimit: '', color: '#41A6AC', isIncome: false });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>('');

  const fetchCategory = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch('/api/categories', {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        const cat = data.categories.find((c: any) => c.id === id);
        if (cat) {
          setCategory(cat);
          setFormData({
            name: cat.name,
            budgetLimit: cat.budgetLimit || '',
            color: cat.color || '#41A6AC',
            isIncome: cat.isIncome || false,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching category:', error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch('/api/transactions', {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        // Filter transactions for this category
        const categoryTransactions = data.transactions.filter(
          (txn: any) => txn.categoryId === id
        );
        setTransactions(categoryTransactions);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategory();
    fetchTransactions();
  }, [id]);

  // Generate available month/year options from transactions
  const monthYearOptions = useMemo(() => {
    const options = new Set<string>();
    transactions.forEach(txn => {
      const date = new Date(txn.date);
      const monthYear = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
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
      const txnMonthYear = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
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

  // Calculate monthly totals
  const monthlyTotal = useMemo(() => {
    const posted = filteredTransactions.filter(txn => !txn.pending);
    const total = posted.reduce((sum, txn) => sum + Math.abs(parseFloat(txn.amount)), 0);
    return total;
  }, [filteredTransactions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch(`/api/categories/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: formData.name,
          budgetLimit: formData.budgetLimit ? parseFloat(formData.budgetLimit) : null,
          color: formData.color,
          isIncome: formData.isIncome,
        }),
      });

      if (!response.ok) throw new Error('Failed to update category');

      setSuccessMessage('Category updated!');
      setEditing(false);
      await fetchCategory();
    } catch (error) {
      console.error('Error updating category:', error);
      setErrorMessage('Failed to update category');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this category? This will uncategorize all transactions.')) return;

    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch(`/api/categories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (!response.ok) throw new Error('Failed to delete category');

      navigate('/categories');
    } catch (error) {
      console.error('Error deleting category:', error);
      setErrorMessage('Failed to delete category');
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <p className="text-red-600">Category not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/categories" className="inline-flex items-center text-gray-600 hover:text-[#41A6AC] mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Categories
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-6 h-6 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            <h1 className="text-3xl font-bold text-gray-900">{category.name}</h1>
          </div>
          <div className="flex gap-2 items-center">
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
            <button
              onClick={() => setEditing(!editing)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Monthly Budget Information */}
        {selectedMonthYear && (
          <div className="mt-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">
                  {formatMonthYear(selectedMonthYear)} Spending
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  ${monthlyTotal.toFixed(2)}
                </p>
              </div>
              {category.budgetLimit && (
                <div className="text-right">
                  <p className="text-sm text-gray-600 mb-1">Monthly Budget</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${parseFloat(category.budgetLimit).toFixed(2)}
                  </p>
                </div>
              )}
            </div>
            {category.budgetLimit && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">Budget Progress</span>
                  <span className={`font-medium ${
                    monthlyTotal > parseFloat(category.budgetLimit) ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {((monthlyTotal / parseFloat(category.budgetLimit)) * 100).toFixed(1)}%
                    {monthlyTotal > parseFloat(category.budgetLimit) ? ' over' : ' used'}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      monthlyTotal > parseFloat(category.budgetLimit)
                        ? 'bg-red-500'
                        : 'bg-[#41A6AC]'
                    }`}
                    style={{
                      width: `${Math.min((monthlyTotal / parseFloat(category.budgetLimit)) * 100, 100)}%`
                    }}
                  />
                </div>
                {monthlyTotal > parseFloat(category.budgetLimit) && (
                  <p className="text-sm text-red-600 mt-2">
                    ${(monthlyTotal - parseFloat(category.budgetLimit)).toFixed(2)} over budget
                  </p>
                )}
                {monthlyTotal <= parseFloat(category.budgetLimit) && (
                  <p className="text-sm text-green-600 mt-2">
                    ${(parseFloat(category.budgetLimit) - monthlyTotal).toFixed(2)} remaining
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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

      {/* Edit Form */}
      {editing && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Category</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#41A6AC] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monthly Budget (optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.budgetLimit}
                  onChange={(e) => setFormData({ ...formData, budgetLimit: e.target.value })}
                  className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#41A6AC] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="h-10 w-16 border border-gray-300 rounded-lg cursor-pointer"
                  />
                  <span className="text-sm text-gray-600">{formData.color}</span>
                </div>
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isIncome}
                  onChange={(e) => setFormData({ ...formData, isIncome: e.target.checked })}
                  className="h-4 w-4 text-[#41A6AC] focus:ring-[#41A6AC] border-gray-300 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Income Category</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-[#41A6AC] text-white rounded-lg hover:bg-[#357f84] transition-colors font-medium"
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transactions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Transactions {selectedMonthYear ? `for ${formatMonthYear(selectedMonthYear)}` : 'in this category'}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
            {selectedMonthYear && transactions.length > filteredTransactions.length && (
              <span className="text-gray-500"> ({transactions.length} total)</span>
            )}
          </p>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            No transactions in this category for this period.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredTransactions.map((txn) => (
              <div key={txn.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{txn.merchantName || txn.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-sm text-gray-500">
                      {new Date(txn.date).toLocaleDateString()}
                    </p>
                    {txn.autoCategorizationMethod && (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                        Auto: {txn.autoCategorizationMethod}
                        {txn.autoCategorizationConfidence &&
                          ` (${Math.round(txn.autoCategorizationConfidence * 100)}%)`
                        }
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right ml-4">
                  <p className={`font-semibold ${parseFloat(txn.amount) < 0 ? 'text-green-600' : 'text-gray-700'}`}>
                    {parseFloat(txn.amount) < 0 ? '+' : '-'}${Math.abs(parseFloat(txn.amount)).toFixed(2)}
                  </p>
                  {txn.pending && (
                    <span className="text-xs text-yellow-600">Pending</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
