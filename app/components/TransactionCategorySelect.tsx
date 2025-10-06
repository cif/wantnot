interface TransactionCategorySelectProps {
  transaction: {
    id: string;
    categoryId: string | null;
    amount: string;
    pending: boolean;
  };
  categories: Array<{
    id: string;
    name: string;
    isIncome: boolean;
  }>;
  onCategorize: (transactionId: string, categoryId: string | null) => Promise<void>;
  isLoading?: boolean;
}

export function TransactionCategorySelect({
  transaction,
  categories,
  onCategorize,
  isLoading = false,
}: TransactionCategorySelectProps) {
  // Pending transactions cannot be categorized
  if (transaction.pending) {
    return (
      <div className="px-2 py-1 text-xs text-gray-400 italic">
        Pending
      </div>
    );
  }

  const isIncome = parseFloat(transaction.amount) < 0;
  const filteredCategories = categories.filter(cat => cat.isIncome === isIncome);

  return (
    <div className="relative">
      <select
        value={transaction.categoryId || ''}
        onChange={(e) => onCategorize(transaction.id, e.target.value || null)}
        disabled={isLoading}
        className="w-full px-2 py-1 text-xs bg-white text-gray-900 border border-gray-300 rounded focus:ring-1 focus:ring-[#41A6AC] focus:border-transparent disabled:opacity-50"
      >
        <option value="">Uncategorized</option>
        {filteredCategories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
        ))}
      </select>
      {isLoading && (
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className="animate-spin h-3 w-3 text-[#41A6AC]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      )}
    </div>
  );
}
