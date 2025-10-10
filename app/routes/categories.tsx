import type { Route } from "./+types/categories";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { AppLayout } from "~/components/AppLayout";
import { useAuth } from "~/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Link } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Categories - WantNot" },
    { name: "description", content: "Manage budget categories" },
  ];
}

export default function Categories() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <CategoriesPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function CategoriesPage() {
  const { getIdToken } = useAuth();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', budgetLimit: '', color: '#41A6AC', isIncome: false });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [draggedCategory, setDraggedCategory] = useState<any>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

  const fetchCategories = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch('/api/categories', {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUncategorizedCount = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch('/api/transactions/uncategorized', {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUncategorizedCount(data.count || 0);
      }
    } catch (error) {
      console.error('Error fetching uncategorized count:', error);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchUncategorizedCount();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const url = editing ? `/api/categories/${editing}` : '/api/categories';
      const method = editing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
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

      if (!response.ok) throw new Error('Failed to save category');

      setSuccessMessage(editing ? 'Category updated!' : 'Category created!');
      setFormData({ name: '', budgetLimit: '', color: '#41A6AC', isIncome: false });
      setEditing(null);
      await fetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      setErrorMessage('Failed to save category');
    }
  };

  const handleEdit = (category: any) => {
    setEditing(category.id);
    setFormData({
      name: category.name,
      budgetLimit: category.budgetLimit || '',
      color: category.color || '#41A6AC',
      isIncome: category.isIncome || false,
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch(`/api/categories/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (!response.ok) throw new Error('Failed to delete category');

      setSuccessMessage('Category deleted!');
      await fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      setErrorMessage('Failed to delete category');
    }
  };

  const handleCancel = () => {
    setEditing(null);
    setFormData({ name: '', budgetLimit: '', color: '#41A6AC', isIncome: false });
  };

  const handleAISuggest = async () => {
    setAiSuggesting(true);
    setErrorMessage(null);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch('/api/categories/ai-suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ limit: 20 }),
      });

      if (!response.ok) throw new Error('Failed to get AI suggestions');

      const data = await response.json();
      setAiSuggestions(data);

      // Auto-select all high-confidence suggestions
      const highConfidence = new Set(
        data.suggestions
          .filter((s: any) => s.confidence >= 0.8)
          .map((s: any) => s.transactionId)
      );
      setSelectedSuggestions(highConfidence);
    } catch (error) {
      console.error('Error getting AI suggestions:', error);
      setErrorMessage('Failed to get AI suggestions');
    } finally {
      setAiSuggesting(false);
    }
  };

  const handleToggleSuggestion = (transactionId: string) => {
    setSelectedSuggestions(prev => {
      const next = new Set(prev);
      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }
      return next;
    });
  };

  const handleApplySuggestions = async () => {
    setApplyingBulk(true);
    setErrorMessage(null);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      // Build categorization map from selected suggestions
      const categorizationMap = aiSuggestions.suggestions
        .filter((s: any) => selectedSuggestions.has(s.transactionId))
        .reduce((acc: any, s: any) => {
          // Find category ID by name
          const category = categories.find(c => c.name === s.suggestedCategory);
          if (category) {
            acc[s.transactionId] = category.id;
          }
          return acc;
        }, {});

      const response = await fetch('/api/transactions/bulk-categorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ categorizations: categorizationMap }),
      });

      if (!response.ok) throw new Error('Failed to apply suggestions');

      const data = await response.json();
      setSuccessMessage(`Successfully categorized ${data.updatedCount} transactions!`);
      setAiSuggestions(null);
      setSelectedSuggestions(new Set());
      await fetchUncategorizedCount();
    } catch (error) {
      console.error('Error applying suggestions:', error);
      setErrorMessage('Failed to apply suggestions');
    } finally {
      setApplyingBulk(false);
    }
  };

  const handleDismissSuggestions = () => {
    setAiSuggestions(null);
    setSelectedSuggestions(new Set());
  };

  const handleDragStart = (e: React.DragEvent, category: any) => {
    setDraggedCategory(category);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, categoryId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCategory(categoryId);
  };

  const handleDragLeave = () => {
    setDragOverCategory(null);
  };

  const handleDrop = async (e: React.DragEvent, targetCategory: any) => {
    e.preventDefault();
    setDragOverCategory(null);

    if (!draggedCategory || draggedCategory.id === targetCategory.id) {
      setDraggedCategory(null);
      return;
    }

    // Separate expense and income categories
    const expenseCategories = categories.filter(c => !c.isIncome);
    const incomeCategories = categories.filter(c => c.isIncome);

    // Only allow reordering within the same type
    if (draggedCategory.isIncome !== targetCategory.isIncome) {
      setDraggedCategory(null);
      return;
    }

    const relevantCategories = draggedCategory.isIncome ? incomeCategories : expenseCategories;

    // Find indices
    const draggedIndex = relevantCategories.findIndex(c => c.id === draggedCategory.id);
    const targetIndex = relevantCategories.findIndex(c => c.id === targetCategory.id);

    // Reorder the array
    const reordered = [...relevantCategories];
    reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, draggedCategory);

    // Update sort orders
    const categoryOrders = reordered.map((cat, index) => ({
      id: cat.id,
      sortOrder: index,
    }));

    // Optimistically update UI
    const newCategories = draggedCategory.isIncome
      ? [...expenseCategories, ...reordered]
      : [...reordered, ...incomeCategories];

    setCategories(newCategories);
    setDraggedCategory(null);

    // Persist to backend
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch('/api/categories/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ categoryOrders }),
      });

      if (!response.ok) throw new Error('Failed to reorder categories');

      // Refresh to get accurate data from server
      await fetchCategories();
    } catch (error) {
      console.error('Error reordering categories:', error);
      setErrorMessage('Failed to save new order');
      // Revert on error
      await fetchCategories();
    }
  };

  const handleDragEnd = () => {
    setDraggedCategory(null);
    setDragOverCategory(null);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Budget Categories</h1>
        <p className="text-gray-600 mt-1">Manage your spending categories and budgets</p>
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

      {/* AI Assist Section */}
      {!aiSuggestions && uncategorizedCount > 0 && (
        <div className="mb-6 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg shadow-sm border border-purple-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                AI Categorization Assistant
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {uncategorizedCount} uncategorized transaction{uncategorizedCount !== 1 ? 's' : ''} found
              </p>
            </div>
            <button
              onClick={handleAISuggest}
              disabled={aiSuggesting}
              className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {aiSuggesting ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Categorize with AI
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* AI Suggestions Review Panel */}
      {aiSuggestions && (
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">AI Suggestions</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Review and apply {aiSuggestions.suggestions?.length || 0} suggestions ({selectedSuggestions.size} selected)
                </p>
                {aiSuggestions.stats && (
                  <div className="flex gap-3 mt-2 text-xs">
                    {aiSuggestions.stats.rule > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                        <span className="text-gray-600">{aiSuggestions.stats.rule} from your rules</span>
                      </span>
                    )}
                    {aiSuggestions.stats.vector > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-purple-500"></span>
                        <span className="text-gray-600">{aiSuggestions.stats.vector} from community</span>
                      </span>
                    )}
                    {aiSuggestions.stats.llm > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                        <span className="text-gray-600">{aiSuggestions.stats.llm} from AI</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDismissSuggestions}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Dismiss
                </button>
                <button
                  onClick={handleApplySuggestions}
                  disabled={applyingBulk || selectedSuggestions.size === 0}
                  className="px-4 py-2 bg-[#41A6AC] text-white rounded-lg hover:bg-[#357f84] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {applyingBulk ? 'Applying...' : `Apply ${selectedSuggestions.size} Selected`}
                </button>
              </div>
            </div>
          </div>

          {/* New Category Recommendations */}
          {aiSuggestions.newCategoryRecommendations?.length > 0 && (
            <div className="p-4 bg-blue-50 border-b border-blue-200">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Suggested New Categories</h3>
              <div className="space-y-2">
                {aiSuggestions.newCategoryRecommendations.map((rec: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: rec.suggestedColor }}
                      />
                      <div>
                        <p className="font-medium text-gray-900">{rec.name}</p>
                        <p className="text-xs text-gray-600">{rec.reason}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">{rec.transactionCount} txns</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions List */}
          <div className="divide-y divide-gray-200 max-h-[500px] overflow-y-auto">
            {aiSuggestions.suggestions?.map((suggestion: any) => {
              const isSelected = selectedSuggestions.has(suggestion.transactionId);
              const category = categories.find(c => c.name === suggestion.suggestedCategory);
              const confidenceColor = suggestion.confidence >= 0.9 ? 'text-green-600' :
                                      suggestion.confidence >= 0.7 ? 'text-yellow-600' : 'text-gray-600';

              // Method badge styling
              const methodBadge = {
                rule: { bg: 'bg-green-100', text: 'text-green-700', label: 'Your Rules' },
                vector: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Community' },
                llm: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'AI' },
              }[suggestion.method] || { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Unknown' };

              return (
                <div
                  key={suggestion.transactionId}
                  className={`p-4 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSuggestion(suggestion.transactionId)}
                      className="mt-1 h-4 w-4 text-[#41A6AC] focus:ring-[#41A6AC] border-gray-300 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{suggestion.transactionName}</p>
                          <p className="text-sm text-gray-500">
                            ${suggestion.amount} • {new Date(suggestion.date).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {category && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-white border border-gray-200 rounded-lg">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: category.color }}
                              />
                              <span className="text-sm font-medium text-gray-700">{suggestion.suggestedCategory}</span>
                            </div>
                          )}
                          {suggestion.isNewCategory && (
                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">New</span>
                          )}
                          {suggestion.method && (
                            <span className={`text-xs px-2 py-1 rounded ${methodBadge.bg} ${methodBadge.text}`}>
                              {methodBadge.label}
                            </span>
                          )}
                          <span className={`text-xs font-medium ${confidenceColor}`}>
                            {Math.round(suggestion.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                      {suggestion.reasoning && (
                        <p className="text-xs text-gray-600 mt-1 italic">{suggestion.reasoning}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Categories List */}
      <div className="mb-6">
        {loading ? (
          <div className="text-gray-600">Loading categories...</div>
        ) : categories.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-600">No categories yet. Create your first one below!</p>
          </div>
        ) : (
          <>
            {/* Expense Categories */}
            {categories.filter(c => !c.isIncome).length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">Expense Categories</h3>
                  <span className="text-xs text-gray-500">(drag to reorder)</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {categories
                    .filter(c => !c.isIncome)
                    .map((category) => (
                      <div
                        key={category.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, category)}
                        onDragOver={(e) => handleDragOver(e, category.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, category)}
                        onDragEnd={handleDragEnd}
                        className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 transition-all cursor-move ${
                          dragOverCategory === category.id ? 'border-[#41A6AC] border-2 scale-105' : ''
                        } ${draggedCategory?.id === category.id ? 'opacity-50' : ''}`}
                      >
                        <Link
                          to={`/categories/${category.id}`}
                          className="flex items-center gap-3 group"
                          onClick={(e) => {
                            if (draggedCategory) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: category.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate group-hover:text-[#41A6AC] transition-colors">
                              {category.name}
                            </h3>
                            {category.budgetLimit && (
                              <p className="text-sm text-gray-600">
                                ${parseFloat(category.budgetLimit).toFixed(2)}/mo
                              </p>
                            )}
                          </div>
                          <svg className="w-5 h-5 text-gray-400 group-hover:text-[#41A6AC] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Income Categories */}
            {categories.filter(c => c.isIncome).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">Income Categories</h3>
                  <span className="text-xs text-gray-500">(drag to reorder)</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {categories
                    .filter(c => c.isIncome)
                    .map((category) => (
                      <div
                        key={category.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, category)}
                        onDragOver={(e) => handleDragOver(e, category.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, category)}
                        onDragEnd={handleDragEnd}
                        className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 transition-all cursor-move ${
                          dragOverCategory === category.id ? 'border-[#41A6AC] border-2 scale-105' : ''
                        } ${draggedCategory?.id === category.id ? 'opacity-50' : ''}`}
                      >
                        <Link
                          to={`/categories/${category.id}`}
                          className="flex items-center gap-3 group"
                          onClick={(e) => {
                            if (draggedCategory) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: category.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-gray-900 truncate group-hover:text-[#41A6AC] transition-colors">
                              {category.name}
                            </h3>
                            {category.budgetLimit && (
                              <p className="text-sm text-gray-600">
                                ${parseFloat(category.budgetLimit).toFixed(2)}/mo
                              </p>
                            )}
                          </div>
                          <svg className="w-5 h-5 text-gray-400 group-hover:text-[#41A6AC] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {editing ? 'Edit Category' : 'Create New Category'}
        </h2>
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
                placeholder="e.g., Groceries"
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
                placeholder="500.00"
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
              {editing ? 'Update Category' : 'Create Category'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
