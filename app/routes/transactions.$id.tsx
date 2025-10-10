import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { X, Save, Mic, Square, EyeOff, ArrowLeftRight } from 'lucide-react';
import { useAuth } from '~/contexts/AuthContext';
import { ProtectedRoute } from '~/components/ProtectedRoute';
import { AppLayout } from '~/components/AppLayout';
import { formatCurrency, formatDate } from '~/lib/format';

export default function TransactionDetail() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <TransactionDetailPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function TransactionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getIdToken } = useAuth();
  const [transaction, setTransaction] = useState<any>(null);
  const [category, setCategory] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [memo, setMemo] = useState('');
  const [isHidden, setIsHidden] = useState(false);
  const [isTransfer, setIsTransfer] = useState(false);
  const [manualMonthYear, setManualMonthYear] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check if browser supports speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setRecognitionSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          setMemo(prev => prev + finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setRecording(false);
      };

      recognition.onend = () => {
        setRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => {
    fetchTransaction();
  }, [id]);

  const fetchTransaction = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const [txnRes, categoriesRes, projectsRes] = await Promise.all([
        fetch(`/api/transactions/${id}`, {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
        fetch('/api/categories', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
        fetch('/api/projects', {
          headers: { 'Authorization': `Bearer ${idToken}` },
        }),
      ]);

      if (txnRes.ok) {
        const data = await txnRes.json();
        setTransaction(data.transaction);
        setMemo(data.transaction.notes || '');
        setIsHidden(data.transaction.isHidden || false);
        setIsTransfer(data.transaction.isTransfer || false);
        setManualMonthYear(data.transaction.manualMonthYear || '');

        if (categoriesRes.ok) {
          const catData = await categoriesRes.json();
          const cat = catData.categories.find((c: any) => c.id === data.transaction.categoryId);
          setCategory(cat);
        }

        if (projectsRes.ok) {
          const projData = await projectsRes.json();
          const proj = projData.projects.find((p: any) => p.id === data.transaction.projectId);
          setProject(proj);
        }
      }
    } catch (error) {
      console.error('Error fetching transaction:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: memo,
          isHidden,
          isTransfer,
          manualMonthYear: manualMonthYear || null,
        }),
      });

      if (response.ok) {
        navigate('/transactions');
      }
    } catch (error) {
      console.error('Error saving transaction:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) return;

    if (recording) {
      recognitionRef.current.stop();
      setRecording(false);
    } else {
      recognitionRef.current.start();
      setRecording(true);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-gray-600">Transaction not found</div>
      </div>
    );
  }

  const isExpense = parseFloat(transaction.amount) > 0;

  // Generate month/year options (±6 months from transaction date)
  const generateMonthOptions = () => {
    const options: { value: string; label: string }[] = [
      { value: '', label: 'Use actual date' }
    ];

    const txnDate = new Date(transaction.date);
    const startDate = new Date(txnDate);
    startDate.setUTCMonth(startDate.getUTCMonth() - 6);

    for (let i = 0; i < 13; i++) {
      const date = new Date(startDate);
      date.setUTCMonth(date.getUTCMonth() + i);
      const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      options.push({ value, label });
    }

    return options;
  };

  const monthOptions = generateMonthOptions();

  // Helper to get the computed month/year for display
  const computedMonthYear = manualMonthYear ||
    `${new Date(transaction.date).getUTCFullYear()}-${String(new Date(transaction.date).getUTCMonth() + 1).padStart(2, '0')}`;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Transaction Details</h1>
        <button
          onClick={() => navigate('/transactions')}
          className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Transaction Info Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              {transaction.merchantName || transaction.name}
            </h2>
            {transaction.merchantName && transaction.name !== transaction.merchantName && (
              <p className="text-sm text-gray-600">{transaction.name}</p>
            )}
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${isExpense ? 'text-gray-900' : 'text-green-600'}`}>
              {isExpense ? '-' : '+'}{formatCurrency(Math.abs(parseFloat(transaction.amount)))}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600 mb-1">Date</p>
            <p className="text-gray-900 font-medium">{formatDate(transaction.date)}</p>
          </div>

          {transaction.pending && (
            <div>
              <p className="text-gray-600 mb-1">Status</p>
              <span className="inline-block px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded text-xs">
                Pending
              </span>
            </div>
          )}

          {category && (
            <div>
              <p className="text-gray-600 mb-1">Category</p>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="text-gray-900 font-medium">{category.name}</span>
              </div>
            </div>
          )}

          {project && (
            <div>
              <p className="text-gray-600 mb-1">Project</p>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="text-gray-900 font-medium">{project.name}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Flags */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Transaction Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Assign to Month
            </label>
            <select
              value={manualMonthYear}
              onChange={(e) => setManualMonthYear(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#41A6AC] focus:border-transparent"
            >
              {monthOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-600 mt-1">
              {manualMonthYear ? `Transaction will appear in ${monthOptions.find(o => o.value === manualMonthYear)?.label} reports` : 'Transaction will appear in its actual date\'s month'}
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={isTransfer}
              onChange={(e) => setIsTransfer(e.target.checked)}
              className="mt-0.5 h-4 w-4 text-[#41A6AC] focus:ring-[#41A6AC] border-gray-300 rounded"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">Mark as Transfer</span>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                Excludes this transaction from income/expense calculations (e.g., moving money between accounts)
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={isHidden}
              onChange={(e) => setIsHidden(e.target.checked)}
              className="mt-0.5 h-4 w-4 text-[#41A6AC] focus:ring-[#41A6AC] border-gray-300 rounded"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">Hide from Reports</span>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                Completely hides this transaction from all lists and reports
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Memo Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-900">
            Memo
          </label>
          {recognitionSupported && (
            <button
              onClick={toggleRecording}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                recording
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {recording ? (
                <>
                  <Square className="w-4 h-4" />
                  Stop
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  Record
                </>
              )}
            </button>
          )}
        </div>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="Add notes about this transaction..."
          rows={6}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#41A6AC] focus:border-transparent resize-none"
        />
      </div>

      {/* File Attachments Section (placeholder) */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <label className="block text-sm font-medium text-gray-900 mb-3">
          Attachments
        </label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-500">File upload coming soon</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#41A6AC] text-white rounded-lg hover:bg-[#368a8f] disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          onClick={() => navigate('/transactions')}
          className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
