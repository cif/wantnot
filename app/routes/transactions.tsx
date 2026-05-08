import type { Route } from "./+types/transactions";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { AppLayout } from "~/components/AppLayout";
import { useAuth } from "~/contexts/AuthContext";
import { TransactionCategorySelect } from "~/components/TransactionCategorySelect";
import { TransactionProjectSelect } from "~/components/TransactionProjectSelect";
import { Toast } from "~/components/Toast";
import { useState, useEffect, useMemo } from "react";
import { EyeOff, Eye, ArrowLeftRight, X, RefreshCw, Check, ChevronDown, ChevronRight } from "lucide-react";
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

  // Recurring groups state
  const [recurringGroups, setRecurringGroups] = useState<any[]>([]);
  const [groupSelections, setGroupSelections] = useState<
    Record<string, { categoryId: string | null; projectId: string | null }>
  >({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [confirmingGroup, setConfirmingGroup] = useState<string | null>(null);
  const [txnSelections, setTxnSelections] = useState<
    Record<string, { categoryId: string | null; projectId: string | null }>
  >({});
  const [confirmingTxnId, setConfirmingTxnId] = useState<string | null>(null);

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

  // Fetch recurring groups (grouped uncategorized with suggestions)
  const fetchRecurringGroups = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch("/api/transactions/recurring-groups", {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        const groups = data.groups || [];
        setRecurringGroups(groups);

        // Initialize group-level and per-transaction selections from suggestions
        const selections: Record<
          string,
          { categoryId: string | null; projectId: string | null }
        > = {};
        const txnSels: Record<
          string,
          { categoryId: string | null; projectId: string | null }
        > = {};
        for (const group of groups) {
          selections[group.merchantPattern] = {
            categoryId: group.suggestedCategoryId,
            projectId: group.suggestedProjectId,
          };
          // Seed per-transaction selections (used by single-row and expanded views)
          for (const txn of group.transactions) {
            txnSels[txn.id] = {
              categoryId: group.suggestedCategoryId,
              projectId: group.suggestedProjectId,
            };
          }
        }
        setGroupSelections(selections);
        setTxnSelections(txnSels);
      }
    } catch (error) {
      console.error("Error fetching recurring groups:", error);
    }
  };

  // Confirm a recurring group (bulk categorize + project tag)
  const handleConfirmGroup = async (merchantPattern: string) => {
    const group = recurringGroups.find(
      (g) => g.merchantPattern === merchantPattern,
    );
    if (!group) return;

    const selection = groupSelections[merchantPattern];
    if (!selection?.categoryId) {
      setErrorMessage("Please select a category before confirming");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    try {
      setConfirmingGroup(merchantPattern);
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Not authenticated");

      const transactionIds = group.transactions.map((t: any) => t.id);

      const response = await fetch("/api/transactions/bulk-categorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          transactionIds,
          categoryId: selection.categoryId,
          projectId: selection.projectId,
        }),
      });

      if (!response.ok) throw new Error("Failed to confirm group");

      // Remove confirmed group from state
      setRecurringGroups((prev) =>
        prev.filter((g) => g.merchantPattern !== merchantPattern),
      );

      // Remove from uncategorized
      setAllUncategorized((prev) =>
        prev.filter((txn) => !transactionIds.includes(txn.id)),
      );

      // Update transactions list if any are currently displayed
      setTransactions((prev) =>
        prev.map((txn) =>
          transactionIds.includes(txn.id)
            ? {
                ...txn,
                categoryId: selection.categoryId,
                projectId: selection.projectId ?? txn.projectId,
                autoCategorizationMethod: "manual",
                autoCategorizationConfidence: 1.0,
              }
            : txn,
        ),
      );

      // Notify badge
      window.dispatchEvent(new Event("transaction-updated"));

      setSuccessMessage(
        `${transactionIds.length} transaction${transactionIds.length !== 1 ? "s" : ""} confirmed!`,
      );
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (error) {
      console.error("Error confirming group:", error);
      setErrorMessage("Failed to confirm group");
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setConfirmingGroup(null);
    }
  };

  const updateGroupSelection = (
    merchantPattern: string,
    field: "categoryId" | "projectId",
    value: string | null,
  ) => {
    setGroupSelections((prev) => ({
      ...prev,
      [merchantPattern]: {
        ...prev[merchantPattern],
        [field]: value,
      },
    }));
  };

  // Remove a single transaction from recurring groups (when individually handled)
  const removeTransactionFromGroups = (transactionId: string) => {
    setRecurringGroups((prev) =>
      prev
        .map((group) => ({
          ...group,
          transactions: group.transactions.filter(
            (t: any) => t.id !== transactionId,
          ),
          count: group.transactions.filter((t: any) => t.id !== transactionId)
            .length,
          totalAmount: group.transactions
            .filter((t: any) => t.id !== transactionId)
            .reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0),
        }))
        .filter((group) => group.transactions.length > 0),
    );
  };

  const toggleGroupExpanded = (merchantPattern: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(merchantPattern)) {
        next.delete(merchantPattern);
      } else {
        next.add(merchantPattern);
      }
      return next;
    });
  };

  const updateTxnSelection = (
    txnId: string,
    field: "categoryId" | "projectId",
    value: string | null,
  ) => {
    setTxnSelections((prev) => ({
      ...prev,
      [txnId]: {
        categoryId: prev[txnId]?.categoryId ?? null,
        projectId: prev[txnId]?.projectId ?? null,
        [field]: value,
      },
    }));
  };

  const handleConfirmTransaction = async (txnId: string) => {
    const selection = txnSelections[txnId];
    if (!selection?.categoryId) {
      setErrorMessage("Please select a category before confirming");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    try {
      setConfirmingTxnId(txnId);
      const idToken = await getIdToken();
      if (!idToken) throw new Error("Not authenticated");

      // Categorize
      const catResponse = await fetch(
        `/api/transactions/${txnId}/categorize`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ categoryId: selection.categoryId }),
        },
      );
      if (!catResponse.ok) throw new Error("Failed to categorize");

      // Tag project if set
      if (selection.projectId) {
        const projResponse = await fetch(
          `/api/transactions/${txnId}/tag-project`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ projectId: selection.projectId }),
          },
        );
        if (!projResponse.ok) throw new Error("Failed to tag project");
      }

      // Update local state
      setTransactions((prev) =>
        prev.map((txn) =>
          txn.id === txnId
            ? {
                ...txn,
                categoryId: selection.categoryId,
                projectId: selection.projectId ?? txn.projectId,
                autoCategorizationMethod: "manual",
                autoCategorizationConfidence: 1.0,
              }
            : txn,
        ),
      );

      // Remove from uncategorized and groups
      setAllUncategorized((prev) => prev.filter((txn) => txn.id !== txnId));
      removeTransactionFromGroups(txnId);

      // Clean up selection
      setTxnSelections((prev) => {
        const next = { ...prev };
        delete next[txnId];
        return next;
      });

      window.dispatchEvent(new Event("transaction-updated"));
      setSuccessMessage("Transaction confirmed!");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (error) {
      console.error("Error confirming transaction:", error);
      setErrorMessage("Failed to confirm transaction");
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setConfirmingTxnId(null);
    }
  };

  // Available months from database
  const [monthYearOptions, setMonthYearOptions] = useState<string[]>([]);

  // Fetch initial data
  const fetchData = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const [categoriesRes, projectsRes, monthsRes] =
        await Promise.all([
          fetch("/api/categories", {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
          fetch("/api/projects", {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
          fetch("/api/transactions/months", {
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

      if (monthsRes.ok) {
        const data = await monthsRes.json();
        setMonthYearOptions(data.months || []);
      }

      // Fetch uncategorized and recurring groups
      await Promise.all([fetchUncategorized(), fetchRecurringGroups()]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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

      // Remove from allUncategorized and recurring groups
      setTimeout(() => {
        setAllUncategorized(
          allUncategorized.filter((txn) => txn.id !== transactionId),
        );
        removeTransactionFromGroups(transactionId);
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

      // Also update allUncategorized and recurring groups state
      if (!currentHiddenState) {
        // If hiding, remove from allUncategorized and recurring groups
        setAllUncategorized(
          allUncategorized.filter((txn) => txn.id !== transactionId),
        );
        removeTransactionFromGroups(transactionId);
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

      {/* Toast Notifications */}
      {successMessage && (
        <Toast
          message={successMessage}
          type="success"
          onClose={() => setSuccessMessage(null)}
        />
      )}
      {errorMessage && (
        <Toast
          message={errorMessage}
          type="error"
          onClose={() => setErrorMessage(null)}
          duration={4000}
        />
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

      {/* Needs Categorization - Recurring Groups */}
      {recurringGroups.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Needs Categorization
              </h2>
              <p className="text-sm text-gray-600 mt-0.5">
                {allUncategorized.length} transaction
                {allUncategorized.length !== 1 ? "s" : ""} across{" "}
                {recurringGroups.length} merchant
                {recurringGroups.length !== 1 ? "s" : ""}
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
              {recurringGroups.map((group) => {
                const selection = groupSelections[group.merchantPattern];
                const isExpanded = expandedGroups.has(group.merchantPattern);
                const isConfirming =
                  confirmingGroup === group.merchantPattern;
                const hasSuggestion = !!group.suggestedCategoryId;
                const isSingle = group.count === 1;

                // Determine if this group is income or expense based on total
                const isIncome = group.totalAmount < 0;
                const filteredCategories = categories.filter(
                  (cat) => cat.isIncome === isIncome,
                );

                // Single transaction: flat row using txnSelections
                if (isSingle) {
                  const txn = group.transactions[0];
                  const txnSel = txnSelections[txn.id];
                  const isConfirmingTxn = confirmingTxnId === txn.id;

                  return (
                    <div
                      key={group.merchantPattern}
                      className={`p-3 transition-all duration-300 ${isConfirmingTxn ? "opacity-50" : ""} ${hasSuggestion ? "bg-emerald-50/50" : ""}`}
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
                          {hasSuggestion && (
                            <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                              Suggested
                            </span>
                          )}
                        </div>

                        {/* Category Dropdown */}
                        <div className="relative w-32 flex-shrink-0">
                          <select
                            value={txnSel?.categoryId || ""}
                            onChange={(e) =>
                              updateTxnSelection(
                                txn.id,
                                "categoryId",
                                e.target.value || null,
                              )
                            }
                            disabled={isConfirmingTxn}
                            className={`w-full px-2 py-1 text-xs bg-white text-gray-900 border rounded focus:ring-1 focus:ring-[#41A6AC] focus:border-transparent disabled:opacity-50 ${
                              hasSuggestion
                                ? "border-emerald-300"
                                : "border-gray-300"
                            }`}
                          >
                            <option value="">Uncategorized</option>
                            {filteredCategories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Project Dropdown */}
                        <div className="relative w-28 flex-shrink-0">
                          <select
                            value={txnSel?.projectId || ""}
                            onChange={(e) =>
                              updateTxnSelection(
                                txn.id,
                                "projectId",
                                e.target.value || null,
                              )
                            }
                            disabled={isConfirmingTxn}
                            className="w-full px-2 py-1 text-xs bg-white text-gray-900 border border-gray-300 rounded focus:ring-1 focus:ring-[#41A6AC] focus:border-transparent disabled:opacity-50"
                          >
                            <option value="">No project</option>
                            {projects.map((proj) => (
                              <option key={proj.id} value={proj.id}>
                                {proj.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Amount */}
                        <div className="w-24 text-right flex-shrink-0">
                          <p
                            className={`text-sm font-semibold tabular-nums ${parseFloat(txn.amount) < 0 ? "text-green-600" : "text-gray-700"}`}
                          >
                            {parseFloat(txn.amount) < 0 ? "+" : "-"}$
                            {Math.abs(parseFloat(txn.amount)).toFixed(2)}
                          </p>
                        </div>

                        {/* Confirm Button */}
                        <button
                          onClick={() => handleConfirmTransaction(txn.id)}
                          disabled={isConfirmingTxn || !txnSel?.categoryId}
                          className={`ml-1 p-1.5 rounded transition-colors flex-shrink-0 ${
                            txnSel?.categoryId
                              ? "text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700"
                              : "text-gray-300 cursor-not-allowed"
                          } disabled:opacity-50`}
                          title={
                            txnSel?.categoryId
                              ? "Confirm"
                              : "Select a category first"
                          }
                        >
                          {isConfirmingTxn ? (
                            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </button>

                        {/* Hide Button */}
                        <button
                          onClick={() =>
                            handleToggleHidden(txn.id, txn.isHidden)
                          }
                          disabled={hidingId === txn.id}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
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
                }

                // Multi-transaction group: collapsible
                return (
                  <div key={group.merchantPattern}>
                    {/* Group Header */}
                    <div
                      className={`p-3 transition-all duration-300 ${isConfirming ? "opacity-50" : ""} ${hasSuggestion ? "bg-emerald-50/50" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Expand toggle */}
                        <button
                          onClick={() =>
                            toggleGroupExpanded(group.merchantPattern)
                          }
                          className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>

                        {/* Merchant Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {group.displayName}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500">
                              {group.count} transactions
                            </span>
                            {hasSuggestion && (
                              <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                                Suggested
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Category Dropdown */}
                        <div className="relative w-32 flex-shrink-0">
                          <select
                            value={selection?.categoryId || ""}
                            onChange={(e) =>
                              updateGroupSelection(
                                group.merchantPattern,
                                "categoryId",
                                e.target.value || null,
                              )
                            }
                            disabled={isConfirming}
                            className={`w-full px-2 py-1 text-xs bg-white text-gray-900 border rounded focus:ring-1 focus:ring-[#41A6AC] focus:border-transparent disabled:opacity-50 ${
                              hasSuggestion
                                ? "border-emerald-300"
                                : "border-gray-300"
                            }`}
                          >
                            <option value="">Uncategorized</option>
                            {filteredCategories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Project Dropdown */}
                        <div className="relative w-28 flex-shrink-0">
                          <select
                            value={selection?.projectId || ""}
                            onChange={(e) =>
                              updateGroupSelection(
                                group.merchantPattern,
                                "projectId",
                                e.target.value || null,
                              )
                            }
                            disabled={isConfirming}
                            className="w-full px-2 py-1 text-xs bg-white text-gray-900 border border-gray-300 rounded focus:ring-1 focus:ring-[#41A6AC] focus:border-transparent disabled:opacity-50"
                          >
                            <option value="">No project</option>
                            {projects.map((proj) => (
                              <option key={proj.id} value={proj.id}>
                                {proj.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Amount */}
                        <div className="w-24 text-right flex-shrink-0">
                          <p
                            className={`text-sm font-semibold tabular-nums ${group.totalAmount < 0 ? "text-green-600" : "text-gray-700"}`}
                          >
                            {group.totalAmount < 0 ? "+" : "-"}$
                            {Math.abs(group.totalAmount).toFixed(2)}
                          </p>
                        </div>

                        {/* Confirm Button */}
                        <button
                          onClick={() =>
                            handleConfirmGroup(group.merchantPattern)
                          }
                          disabled={
                            isConfirming || !selection?.categoryId
                          }
                          className={`ml-1 p-1.5 rounded transition-colors flex-shrink-0 ${
                            selection?.categoryId
                              ? "text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700"
                              : "text-gray-300 cursor-not-allowed"
                          } disabled:opacity-50`}
                          title={
                            selection?.categoryId
                              ? `Confirm ${group.count} transactions`
                              : "Select a category first"
                          }
                        >
                          {isConfirming ? (
                            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Transaction List */}
                    {isExpanded && (
                      <div className="bg-gray-50 border-t border-gray-100">
                        {group.transactions.map((txn: any) => {
                          const txnSel = txnSelections[txn.id];
                          const isConfirmingTxn = confirmingTxnId === txn.id;
                          const txnIsIncome = parseFloat(txn.amount) < 0;
                          const txnCategories = categories.filter(
                            (cat) => cat.isIncome === txnIsIncome,
                          );
                          return (
                            <div
                              key={txn.id}
                              className={`px-3 py-2 pl-10 hover:bg-gray-100 transition-all duration-300 border-t border-gray-100 first:border-t-0 ${isConfirmingTxn ? "opacity-50" : ""}`}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-14 flex-shrink-0 cursor-pointer"
                                  onClick={() =>
                                    (window.location.href = `/transactions/${txn.id}`)
                                  }
                                >
                                  <p className="text-xs text-gray-600">
                                    {new Date(txn.date).toLocaleDateString(
                                      "en-US",
                                      {
                                        month: "short",
                                        day: "numeric",
                                        timeZone: "UTC",
                                      },
                                    )}
                                  </p>
                                </div>
                                <div
                                  className="flex-1 min-w-0 cursor-pointer"
                                  onClick={() =>
                                    (window.location.href = `/transactions/${txn.id}`)
                                  }
                                >
                                  <p className="text-xs text-gray-700 truncate">
                                    {txn.name}
                                  </p>
                                </div>

                                {/* Category Dropdown */}
                                <div className="relative w-32 flex-shrink-0">
                                  <select
                                    value={txnSel?.categoryId || ""}
                                    onChange={(e) =>
                                      updateTxnSelection(
                                        txn.id,
                                        "categoryId",
                                        e.target.value || null,
                                      )
                                    }
                                    disabled={isConfirmingTxn}
                                    className="w-full px-2 py-1 text-xs bg-white text-gray-900 border border-gray-300 rounded focus:ring-1 focus:ring-[#41A6AC] focus:border-transparent disabled:opacity-50"
                                  >
                                    <option value="">Uncategorized</option>
                                    {txnCategories.map((cat) => (
                                      <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Project Dropdown */}
                                <div className="relative w-28 flex-shrink-0">
                                  <select
                                    value={txnSel?.projectId || ""}
                                    onChange={(e) =>
                                      updateTxnSelection(
                                        txn.id,
                                        "projectId",
                                        e.target.value || null,
                                      )
                                    }
                                    disabled={isConfirmingTxn}
                                    className="w-full px-2 py-1 text-xs bg-white text-gray-900 border border-gray-300 rounded focus:ring-1 focus:ring-[#41A6AC] focus:border-transparent disabled:opacity-50"
                                  >
                                    <option value="">No project</option>
                                    {projects.map((proj) => (
                                      <option key={proj.id} value={proj.id}>
                                        {proj.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="w-24 text-right flex-shrink-0">
                                  <p
                                    className={`text-xs font-medium tabular-nums ${parseFloat(txn.amount) < 0 ? "text-green-600" : "text-gray-600"}`}
                                  >
                                    {parseFloat(txn.amount) < 0 ? "+" : "-"}$
                                    {Math.abs(parseFloat(txn.amount)).toFixed(
                                      2,
                                    )}
                                  </p>
                                </div>

                                {/* Confirm Button */}
                                <button
                                  onClick={() =>
                                    handleConfirmTransaction(txn.id)
                                  }
                                  disabled={
                                    isConfirmingTxn || !txnSel?.categoryId
                                  }
                                  className={`p-1 rounded transition-colors flex-shrink-0 ${
                                    txnSel?.categoryId
                                      ? "text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700"
                                      : "text-gray-300 cursor-not-allowed"
                                  } disabled:opacity-50`}
                                  title={
                                    txnSel?.categoryId
                                      ? "Confirm"
                                      : "Select a category first"
                                  }
                                >
                                  {isConfirmingTxn ? (
                                    <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Check className="w-3.5 h-3.5" />
                                  )}
                                </button>

                                {/* Hide Button */}
                                <button
                                  onClick={() =>
                                    handleToggleHidden(txn.id, txn.isHidden)
                                  }
                                  disabled={hidingId === txn.id}
                                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
                                  title="Hide transaction"
                                >
                                  {hidingId === txn.id ? (
                                    <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <EyeOff className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
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
