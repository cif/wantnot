import type { Route } from "./+types/transactions";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { AppLayout } from "~/components/AppLayout";
import { useAuth } from "~/contexts/AuthContext";
import { TransactionCategorySelect } from "~/components/TransactionCategorySelect";
import { TransactionProjectSelect } from "~/components/TransactionProjectSelect";
import { useState, useEffect, useMemo } from "react";
import { EyeOff, Eye, ArrowLeftRight, X, RefreshCw } from "lucide-react";
import { formatCurrency } from "~/lib/format";

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
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [showHidden, setShowHidden] = useState(false);
  const [hidingId, setHidingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [allUncategorized, setAllUncategorized] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"list" | "category" | "project">(
    "category",
  );

  // Fetch transactions for selected month
  const fetchTransactionsForMonth = async (monthYear: string) => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch(
        `/api/transactions?month=${monthYear}&includeHidden=${showHidden}`,
        {
          headers: { Authorization: `Bearer ${idToken}` },
        },
      );

      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    }
  };

  // Fetch uncategorized transactions
  const fetchUncategorized = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch(
        `/api/transactions/uncategorized?includeHidden=${showHidden}`,
        {
          headers: { Authorization: `Bearer ${idToken}` },
        },
      );

      if (response.ok) {
        const data = await response.json();
        setAllUncategorized(data.transactions || []);
      }
    } catch (error) {
      console.error("Error fetching uncategorized transactions:", error);
    }
  };

  // State for building month dropdown
  const [allTransactionsForMonths, setAllTransactionsForMonths] = useState<
    any[]
  >([]);

  // Fetch initial data
  const fetchData = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const [categoriesRes, projectsRes, allTransactionsRes] =
        await Promise.all([
          fetch("/api/categories", {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
          fetch("/api/projects", {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
          // Fetch all recent transactions to populate month dropdown
          fetch("/api/transactions", {
            headers: { Authorization: `Bearer ${idToken}` },
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

      // Store transactions ONLY for building month options, not for display
      if (allTransactionsRes.ok) {
        const data = await allTransactionsRes.json();
        setAllTransactionsForMonths(data.transactions || []);
      }

      // Fetch uncategorized separately so it can be refetched when showHidden changes
      await fetchUncategorized();
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Helper function to compute month/year for a transaction
  const getTransactionMonthYear = (txn: any): string => {
    // Use manual override if set, otherwise compute from date
    if (txn.manualMonthYear) {
      return txn.manualMonthYear;
    }
    const date = new Date(txn.date);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  // Generate available month/year options from both allTransactionsForMonths and allUncategorized
  const monthYearOptions = useMemo(() => {
    const options = new Set<string>();
    // Add months from recent transactions
    allTransactionsForMonths.forEach((txn) => {
      options.add(getTransactionMonthYear(txn));
    });
    // Also add months from all uncategorized transactions (so older months appear)
    allUncategorized.forEach((txn) => {
      options.add(getTransactionMonthYear(txn));
    });
    return Array.from(options).sort().reverse(); // Most recent first
  }, [allTransactionsForMonths, allUncategorized]);

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

  // Refetch uncategorized transactions when showHidden changes
  useEffect(() => {
    fetchUncategorized();
  }, [showHidden]);

  // Filter transactions by category and project
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    // Apply category filter
    if (selectedCategoryId === "uncategorized") {
      filtered = filtered.filter((txn) => !txn.categoryId);
    } else if (selectedCategoryId !== "all") {
      filtered = filtered.filter(
        (txn) => txn.categoryId === selectedCategoryId,
      );
    }

    // Apply project filter
    if (selectedProjectId === "untagged") {
      filtered = filtered.filter((txn) => !txn.projectId);
    } else if (selectedProjectId !== "all") {
      filtered = filtered.filter((txn) => txn.projectId === selectedProjectId);
    }

    return filtered;
  }, [transactions, selectedCategoryId, selectedProjectId]);

  // Filter transactions for charts (always exclude hidden)
  const filteredTransactionsForCharts = useMemo(() => {
    let filtered = transactions.filter((txn) => !txn.isHidden);

    // Apply category filter
    if (selectedCategoryId === "uncategorized") {
      filtered = filtered.filter((txn) => !txn.categoryId);
    } else if (selectedCategoryId !== "all") {
      filtered = filtered.filter(
        (txn) => txn.categoryId === selectedCategoryId,
      );
    }

    // Apply project filter
    if (selectedProjectId === "untagged") {
      filtered = filtered.filter((txn) => !txn.projectId);
    } else if (selectedProjectId !== "all") {
      filtered = filtered.filter((txn) => txn.projectId === selectedProjectId);
    }

    return filtered;
  }, [transactions, selectedCategoryId, selectedProjectId]);

  // Format month/year for display
  const formatMonthYear = (monthYear: string) => {
    if (!monthYear) return "";
    const [year, month] = monthYear.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const handleCategorize = async (
    transactionId: string,
    categoryId: string | null,
  ) => {
    try {
      setCategorizingId(transactionId);
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Not authenticated");

      const response = await fetch(
        `/api/transactions/${transactionId}/categorize`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ categoryId }),
        },
      );

      if (!response.ok) throw new Error("Failed to categorize transaction");

      // Update local state
      setTransactions(
        transactions.map((txn) =>
          txn.id === transactionId
            ? {
                ...txn,
                categoryId,
                autoCategorizationMethod: "manual",
                autoCategorizationConfidence: 1.0,
              }
            : txn,
        ),
      );

      // Remove from allUncategorized after a brief delay to allow fade animation
      setTimeout(() => {
        setAllUncategorized(
          allUncategorized.filter((txn) => txn.id !== transactionId),
        );
      }, 150);

      // Notify AppLayout to refresh badge count
      window.dispatchEvent(new Event("transaction-updated"));

      setSuccessMessage("Transaction categorized!");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (error) {
      console.error("Error categorizing transaction:", error);
      setErrorMessage("Failed to categorize transaction");
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setCategorizingId(null);
    }
  };

  const handleTagProject = async (
    transactionId: string,
    projectId: string | null,
  ) => {
    try {
      setTaggingProjectId(transactionId);
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Not authenticated");

      const response = await fetch(
        `/api/transactions/${transactionId}/tag-project`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ projectId }),
        },
      );

      if (!response.ok)
        throw new Error("Failed to tag transaction with project");

      // Update local state
      setTransactions(
        transactions.map((txn) =>
          txn.id === transactionId ? { ...txn, projectId } : txn,
        ),
      );

      // Also update allUncategorized
      setAllUncategorized(
        allUncategorized.map((txn) =>
          txn.id === transactionId ? { ...txn, projectId } : txn,
        ),
      );

      setSuccessMessage("Transaction tagged!");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (error) {
      console.error("Error tagging transaction with project:", error);
      setErrorMessage("Failed to tag transaction");
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setTaggingProjectId(null);
    }
  };

  const handleToggleHidden = async (
    transactionId: string,
    currentHiddenState: boolean,
  ) => {
    try {
      setHidingId(transactionId);
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Not authenticated");

      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ isHidden: !currentHiddenState }),
      });

      if (!response.ok) throw new Error("Failed to update transaction");

      // Update local state
      setTransactions(
        transactions.map((txn) =>
          txn.id === transactionId
            ? { ...txn, isHidden: !currentHiddenState }
            : txn,
        ),
      );

      // Also update allUncategorized state
      if (!currentHiddenState) {
        // If hiding, remove from allUncategorized
        setAllUncategorized(
          allUncategorized.filter((txn) => txn.id !== transactionId),
        );
      } else {
        // If unhiding, we need to check if it should be in the list
        // For simplicity, just refetch the uncategorized list
        const idToken = await getIdToken();
        if (idToken) {
          const response = await fetch("/api/transactions/uncategorized", {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (response.ok) {
            const data = await response.json();
            setAllUncategorized(data.transactions || []);
          }
        }
      }

      // Notify AppLayout to refresh badge count
      window.dispatchEvent(new Event("transaction-updated"));

      setSuccessMessage(
        currentHiddenState ? "Transaction unhidden!" : "Transaction hidden!",
      );
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (error) {
      console.error("Error hiding transaction:", error);
      setErrorMessage("Failed to update transaction");
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setHidingId(null);
    }
  };

  const handleRefreshTransactions = async () => {
    try {
      setIsRefreshing(true);
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Not authenticated");

      const response = await fetch("/api/plaid/sync-transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error("Failed to sync transactions");

      // Refresh data after sync
      await fetchData();
      setSuccessMessage("Transactions synced successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Error syncing transactions:", error);
      setErrorMessage("Failed to sync transactions");
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Calculate totals for the selected month (excluding transfers)
  const monthTotals = useMemo(() => {
    // Exclude transfers from calculations
    const nonTransfers = filteredTransactions.filter((txn) => !txn.isTransfer);

    const posted = nonTransfers.filter((txn) => !txn.pending);
    const pending = nonTransfers.filter((txn) => txn.pending);

    const income = posted
      .filter((txn) => parseFloat(txn.amount) < 0)
      .reduce((sum, txn) => sum + Math.abs(parseFloat(txn.amount)), 0);

    const expenses = posted
      .filter((txn) => parseFloat(txn.amount) > 0)
      .reduce((sum, txn) => sum + parseFloat(txn.amount), 0);

    const pendingIncome = pending
      .filter((txn) => parseFloat(txn.amount) < 0)
      .reduce((sum, txn) => sum + Math.abs(parseFloat(txn.amount)), 0);

    const pendingExpenses = pending
      .filter((txn) => parseFloat(txn.amount) > 0)
      .reduce((sum, txn) => sum + parseFloat(txn.amount), 0);

    return {
      income,
      expenses,
      net: income - expenses,
      pendingIncome,
      pendingExpenses,
      hasPending: pending.length > 0,
    };
  }, [filteredTransactions]);

  // Calculate category spending breakdown (for "By Category" view)
  const categorySpending = useMemo(() => {
    // Only include posted, non-transfer transactions
    const relevantTransactions = filteredTransactionsForCharts.filter(
      (txn) => !txn.pending && !txn.isTransfer,
    );

    // Group by category
    const categoryMap = new Map<
      string,
      { category: any; transactions: any[]; total: number }
    >();

    relevantTransactions.forEach((txn) => {
      const categoryId = txn.categoryId || "uncategorized";
      const amount = Math.abs(parseFloat(txn.amount));

      if (!categoryMap.has(categoryId)) {
        const category = categories.find((c) => c.id === categoryId);
        categoryMap.set(categoryId, {
          category: category || {
            id: "uncategorized",
            name: "Uncategorized",
            color: "#9CA3AF",
            isIncome: false,
          },
          transactions: [],
          total: 0,
        });
      }

      const entry = categoryMap.get(categoryId)!;
      entry.transactions.push(txn);
      entry.total += amount;
    });

    // Convert to array and separate expenses/income
    const allCategories = Array.from(categoryMap.values());

    const expenses = allCategories.filter(({ category }) => {
      // Only use the category's isIncome flag
      // Don't check individual transactions (they may have refunds/credits)
      return !category.isIncome;
    });
    //.sort((a, b) => b.total - a.total);

    const income = allCategories.filter(({ category }) => {
      // Only use the category's isIncome flag
      return category.isIncome;
    });
    // .sort((a, b) => b.total - a.total);

    const totalExpenses = expenses.reduce((sum, { total }) => sum + total, 0);
    const totalIncome = income.reduce((sum, { total }) => sum + total, 0);

    return {
      expenses,
      income,
      totalExpenses,
      totalIncome,
    };
  }, [filteredTransactionsForCharts, categories]);

  // Calculate project spending breakdown (for "By Project" view)
  const projectSpending = useMemo(() => {
    // Only include posted, non-transfer transactions
    const relevantTransactions = filteredTransactionsForCharts.filter(
      (txn) => !txn.pending && !txn.isTransfer,
    );

    // Group by project
    const projectMap = new Map<
      string,
      { project: any; transactions: any[]; total: number }
    >();

    relevantTransactions.forEach((txn) => {
      const projectId = txn.projectId || "untagged";
      const amount = Math.abs(parseFloat(txn.amount));

      if (!projectMap.has(projectId)) {
        const project = projects.find((p) => p.id === projectId);
        projectMap.set(projectId, {
          project: project || {
            id: "untagged",
            name: "Untagged",
            color: "#9CA3AF",
          },
          transactions: [],
          total: 0,
        });
      }

      const entry = projectMap.get(projectId)!;
      entry.transactions.push(txn);
      entry.total += amount;
    });

    // Convert to array and sort by total (highest first)
    const allProjects = Array.from(projectMap.values()).sort(
      (a, b) => b.total - a.total,
    );

    const totalSpending = allProjects.reduce(
      (sum, { total }) => sum + total,
      0,
    );

    return {
      projects: allProjects,
      totalSpending,
    };
  }, [filteredTransactionsForCharts, projects]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Header with Month/Year Filter */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {filteredTransactions.length} transaction
            {filteredTransactions.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHidden(!showHidden)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showHidden
                ? "bg-[#41A6AC] text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            title={
              showHidden
                ? "Hide hidden transactions"
                : "Show hidden transactions"
            }
          >
            {showHidden ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
            <span>{showHidden ? "Showing" : "Hiding"} Hidden</span>
          </button>

          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#41A6AC] focus:border-transparent"
          >
            <option value="all">All Categories</option>
            <option value="uncategorized">Uncategorized</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          {monthYearOptions.length > 0 && (
            <select
              value={selectedMonthYear}
              onChange={(e) => setSelectedMonthYear(e.target.value)}
              className="px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#41A6AC] focus:border-transparent"
            >
              {monthYearOptions.map((monthYear) => (
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
          <p className="text-lg font-bold text-green-600 tabular-nums">
            {formatCurrency(monthTotals.income, { showSign: true })}
          </p>
          {monthTotals.hasPending && monthTotals.pendingIncome > 0 && (
            <p className="text-xs text-yellow-600 mt-0.5 tabular-nums">
              {formatCurrency(monthTotals.pendingIncome, { showSign: true })}{" "}
              pending
            </p>
          )}
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Expenses</p>
          <p className="text-lg font-bold text-gray-700 tabular-nums">
            -{formatCurrency(monthTotals.expenses)}
          </p>
          {monthTotals.hasPending && monthTotals.pendingExpenses > 0 && (
            <p className="text-xs text-yellow-600 mt-0.5 tabular-nums">
              -{formatCurrency(monthTotals.pendingExpenses)} pending
            </p>
          )}
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Net</p>
          <p
            className={`text-lg font-bold tabular-nums ${monthTotals.net >= 0 ? "text-green-600" : "text-gray-700"}`}
          >
            {monthTotals.net >= 0 ? "+" : "-"}
            {formatCurrency(Math.abs(monthTotals.net))}
          </p>
          {monthTotals.hasPending && (
            <p className="text-xs text-yellow-600 mt-0.5 tabular-nums">
              {monthTotals.pendingIncome - monthTotals.pendingExpenses >= 0
                ? "+"
                : "-"}
              {formatCurrency(
                Math.abs(
                  monthTotals.pendingIncome - monthTotals.pendingExpenses,
                ),
              )}{" "}
              pending
            </p>
          )}
        </div>
      </div>

      {/* Needs Categorization Section */}
      {allUncategorized.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Needs Categorization
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                {allUncategorized.length} transaction
                {allUncategorized.length !== 1 ? "s" : ""} need
                {allUncategorized.length === 1 ? "s" : ""} a category
              </p>
            </div>
            <button
              onClick={handleRefreshTransactions}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-4 py-2 bg-[#41A6AC] text-white rounded-lg hover:bg-[#35858a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span className="font-medium">
                {isRefreshing ? "Syncing..." : "Sync Transactions"}
              </span>
            </button>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-4">
            <div className="divide-y divide-gray-100">
              {allUncategorized.slice(0, 10).map((txn) => {
                const project = projects.find((p) => p.id === txn.projectId);
                const isBeingCategorized = categorizingId === txn.id;
                return (
                  <div
                    key={txn.id}
                    className={`p-3 hover:bg-gray-50 transition-all duration-300 ${isBeingCategorized ? "opacity-50" : "opacity-100"}`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Date */}
                      <div
                        className="w-14 flex-shrink-0 cursor-pointer"
                        onClick={() =>
                          (window.location.href = `/transactions/${txn.id}`)
                        }
                      >
                        <p className="text-xs font-medium text-gray-900">
                          {new Date(txn.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          })}
                        </p>
                      </div>

                      {/* Transaction Info */}
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() =>
                          (window.location.href = `/transactions/${txn.id}`)
                        }
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
                              <span className="text-xs text-gray-600">
                                {project.name}
                              </span>
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
                        <p
                          className={`text-sm font-semibold ${parseFloat(txn.amount) < 0 ? "text-green-600" : "text-gray-700"}`}
                        >
                          {parseFloat(txn.amount) < 0 ? "+" : "-"}$
                          {Math.abs(parseFloat(txn.amount)).toFixed(2)}
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
              +{allUncategorized.length - 10} more transactions need
              categorization
            </p>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      {!loading && filteredTransactions.length > 0 && (
        <div className="mb-4 flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab("list")}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === "list"
                ? "text-[#41A6AC] border-b-2 border-[#41A6AC]"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            List
          </button>
          <button
            onClick={() => setActiveTab("category")}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === "category"
                ? "text-[#41A6AC] border-b-2 border-[#41A6AC]"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            By Category
          </button>
          <button
            onClick={() => setActiveTab("project")}
            className={`px-6 py-3 font-medium text-sm transition-colors ${
              activeTab === "project"
                ? "text-[#41A6AC] border-b-2 border-[#41A6AC]"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            By Project
          </button>
        </div>
      )}

      {/* By Category View */}
      {activeTab === "category" &&
        !loading &&
        filteredTransactions.length > 0 && (
          <div className="space-y-6">
            {/* Expenses */}
            {categorySpending.expenses.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Expenses
                  </h3>
                  <p className="text-sm text-gray-600 mt-0.5 tabular-nums">
                    Total: {formatCurrency(categorySpending.totalExpenses)}
                  </p>
                </div>

                {/* Overall Budget Summary */}
                {(() => {
                  const totalBudget = categorySpending.expenses
                    .filter(({ category }) => category.budgetLimit)
                    .reduce(
                      (sum, { category }) =>
                        sum + parseFloat(category.budgetLimit),
                      0,
                    );

                  const totalBudgetedSpending = categorySpending.expenses
                    .filter(({ category }) => category.budgetLimit)
                    .reduce((sum, { total }) => sum + total, 0);

                  if (totalBudget > 0) {
                    const overallPercentage =
                      (totalBudgetedSpending / totalBudget) * 100;
                    const overallBarWidth = Math.min(overallPercentage, 100);

                    return (
                      <div className="mb-4 pb-4 border-b border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 text-sm">
                              Total Budget Usage
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900 text-sm tabular-nums">
                              {formatCurrency(totalBudgetedSpending)}
                            </p>
                            <p className="text-xs text-gray-500 tabular-nums">
                              of {formatCurrency(totalBudget)}
                            </p>
                          </div>
                        </div>
                        <div className="relative">
                          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all bg-[#41A6AC]"
                              style={{ width: `${overallBarWidth}%` }}
                            />
                          </div>
                          <p
                            className={`text-xs mt-1 ${
                              overallPercentage > 100
                                ? "text-red-600 font-medium"
                                : "text-gray-500"
                            }`}
                          >
                            {overallPercentage.toFixed(1)}% of total budget
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categorySpending.expenses.map(
                    ({ category, total, transactions }) => {
                      // Calculate percentage of budget used (for bar width)
                      const budgetPercentage = category.budgetLimit
                        ? (total / parseFloat(category.budgetLimit)) * 100
                        : null;

                      // Bar width: cap at 100% for visual display
                      const barWidth =
                        budgetPercentage !== null
                          ? Math.min(budgetPercentage, 100)
                          : 0;

                      return (
                        <button
                          key={category.id}
                          onClick={() => {
                            setSelectedCategoryId(category.id);
                            setSelectedProjectId("all");
                            setActiveTab("list");
                          }}
                          className="w-full text-left hover:bg-gray-50 p-3 rounded-lg transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: category.color }}
                              />
                              <span className="font-medium text-gray-900 text-sm truncate">
                                {category.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({transactions.length})
                              </span>
                            </div>
                            <div className="text-right ml-4">
                              <p className="font-semibold text-gray-900 text-sm tabular-nums">
                                {formatCurrency(total)}
                              </p>
                              {category.budgetLimit && (
                                <p className="text-xs text-gray-500 tabular-nums">
                                  of {formatCurrency(category.budgetLimit)}
                                </p>
                              )}
                            </div>
                          </div>
                          {category.budgetLimit ? (
                            <div className="relative">
                              <div
                                className="w-full rounded-full h-2 overflow-hidden"
                                style={{
                                  backgroundColor: `${category.color}20`,
                                }}
                              >
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${barWidth}%`,
                                    backgroundColor: category.color,
                                  }}
                                />
                              </div>
                              <p
                                className={`text-xs mt-1 ${
                                  budgetPercentage > 100
                                    ? "text-red-600"
                                    : "text-gray-500"
                                }`}
                              >
                                {budgetPercentage.toFixed(1)}% of budget
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 mt-1">
                              No budget set
                            </p>
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            )}

            {/* Spending Breakdown - Stacked Bar */}
            {categorySpending.expenses.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Spending Breakdown
                  </h3>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Percentage of total spending by category
                  </p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden flex">
                  {categorySpending.expenses.map(({ category, total }, idx) => {
                    const percentage =
                      (total / categorySpending.totalExpenses) * 100;
                    return (
                      <div
                        key={category.id}
                        className="h-full flex items-center justify-center relative group cursor-pointer transition-all hover:brightness-110"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: category.color,
                          opacity: 0.85,
                        }}
                        onClick={() => {
                          setSelectedCategoryId(category.id);
                          setSelectedProjectId("all");
                          setActiveTab("list");
                        }}
                        title={`${category.name}: ${formatCurrency(total)} (${percentage.toFixed(1)}%)`}
                      >
                        {percentage > 8 && (
                          <span className="text-xs font-medium text-white drop-shadow-sm">
                            {percentage.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-3">
                  {categorySpending.expenses.map(({ category, total }) => {
                    const percentage =
                      (total / categorySpending.totalExpenses) * 100;
                    return (
                      <div
                        key={category.id}
                        className="flex items-center gap-1.5"
                      >
                        <div
                          className="w-3 h-3 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="text-xs text-gray-700">
                          {category.name} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Income */}
            {categorySpending.income.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Income
                  </h3>
                  <p className="text-sm text-gray-600 mt-0.5 tabular-nums">
                    Total:{" "}
                    {formatCurrency(categorySpending.totalIncome, {
                      showSign: true,
                    })}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categorySpending.income.map(
                    ({ category, total, transactions }) => {
                      // Calculate percentage of budget used (for bar width)
                      const budgetPercentage = category.budgetLimit
                        ? (total / parseFloat(category.budgetLimit)) * 100
                        : null;

                      // Bar width: cap at 100% for visual display
                      const barWidth =
                        budgetPercentage !== null
                          ? Math.min(budgetPercentage, 100)
                          : 0;

                      return (
                        <button
                          key={category.id}
                          onClick={() => {
                            setSelectedCategoryId(category.id);
                            setSelectedProjectId("all");
                            setActiveTab("list");
                          }}
                          className="w-full text-left hover:bg-gray-50 p-3 rounded-lg transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: category.color }}
                              />
                              <span className="font-medium text-gray-900 text-sm truncate">
                                {category.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({transactions.length})
                              </span>
                            </div>
                            <div className="text-right ml-4">
                              <p className="font-semibold text-green-600 text-sm tabular-nums">
                                {formatCurrency(total, { showSign: true })}
                              </p>
                              {category.budgetLimit && (
                                <p className="text-xs text-gray-500 tabular-nums">
                                  of {formatCurrency(category.budgetLimit)}
                                </p>
                              )}
                            </div>
                          </div>
                          {category.budgetLimit ? (
                            <div className="relative">
                              <div
                                className="w-full rounded-full h-2 overflow-hidden"
                                style={{
                                  backgroundColor: `${category.color}20`,
                                }}
                              >
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${barWidth}%`,
                                    backgroundColor: category.color,
                                  }}
                                />
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                {budgetPercentage.toFixed(1)}% of budget
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 mt-1">
                              No budget set
                            </p>
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            )}

            {categorySpending.expenses.length === 0 &&
              categorySpending.income.length === 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                  <p className="text-gray-600">
                    No categorized transactions found for this period.
                  </p>
                </div>
              )}
          </div>
        )}

      {/* By Project View */}
      {activeTab === "project" &&
        !loading &&
        filteredTransactions.length > 0 && (
          <div className="space-y-6">
            {projectSpending.projects.length > 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Projects
                  </h3>
                  <p className="text-sm text-gray-600 mt-0.5 tabular-nums">
                    Total: {formatCurrency(projectSpending.totalSpending)}
                  </p>
                </div>

                <div className="space-y-3">
                  {projectSpending.projects.map(
                    ({ project, total, transactions }, idx, arr) => {
                      // Calculate bar width relative to max spending project
                      const maxSpending = arr.length > 0 ? arr[0].total : total;
                      const barWidth = (total / maxSpending) * 100;
                      const percentageOfTotal =
                        (total / projectSpending.totalSpending) * 100;

                      return (
                        <button
                          key={project.id}
                          onClick={() => {
                            setSelectedProjectId(project.id);
                            setSelectedCategoryId("all");
                            setActiveTab("list");
                          }}
                          className="w-full text-left hover:bg-gray-50 p-3 rounded-lg transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: project.color }}
                              />
                              <span className="font-medium text-gray-900 text-sm truncate">
                                {project.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                ({transactions.length})
                              </span>
                            </div>
                            <div className="text-right ml-4">
                              <p className="font-semibold text-gray-900 text-sm tabular-nums">
                                {formatCurrency(total)}
                              </p>
                              <p className="text-xs text-gray-600">
                                {percentageOfTotal.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                          <div className="relative">
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${barWidth}%`,
                                  backgroundColor: project.color,
                                }}
                              />
                            </div>
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <p className="text-gray-600">
                  No project-tagged transactions found for this period.
                </p>
              </div>
            )}
          </div>
        )}

      {/* List View (Transactions Table) */}
      {activeTab === "list" && loading ? (
        <div className="text-gray-600 text-center py-8">Loading...</div>
      ) : activeTab === "list" && filteredTransactions.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-gray-600">
            No transactions found for this period.
          </p>
        </div>
      ) : (
        activeTab === "list" && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {filteredTransactions.map((txn) => {
                const category = categories.find(
                  (c) => c.id === txn.categoryId,
                );
                const project = projects.find((p) => p.id === txn.projectId);

                return (
                  <div
                    key={txn.id}
                    className="p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Date */}
                      <div
                        className="w-14 flex-shrink-0 cursor-pointer"
                        onClick={() =>
                          (window.location.href = `/transactions/${txn.id}`)
                        }
                      >
                        <p className="text-xs font-medium text-gray-900">
                          {new Date(txn.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          })}
                        </p>
                      </div>

                      {/* Transaction Info */}
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() =>
                          (window.location.href = `/transactions/${txn.id}`)
                        }
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
                              <span className="text-xs text-gray-600">
                                {category.name}
                              </span>
                            </div>
                          )}
                          {project && (
                            <div className="flex items-center gap-1">
                              <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: project.color }}
                              />
                              <span className="text-xs text-gray-600">
                                {project.name}
                              </span>
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
                        <p
                          className={`text-sm font-semibold ${parseFloat(txn.amount) < 0 ? "text-green-600" : "text-gray-700"}`}
                        >
                          {parseFloat(txn.amount) < 0 ? "+" : "-"}$
                          {Math.abs(parseFloat(txn.amount)).toFixed(2)}
                        </p>
                      </div>

                      {/* Hide/Unhide Button */}
                      <button
                        onClick={() => handleToggleHidden(txn.id, txn.isHidden)}
                        disabled={hidingId === txn.id}
                        className="ml-2 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                        title={
                          txn.isHidden
                            ? "Unhide transaction"
                            : "Hide transaction"
                        }
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
        )
      )}
    </div>
  );
}
