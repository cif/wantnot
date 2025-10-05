import type { Route } from "./+types/projects.$id";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { AppLayout } from "~/components/AppLayout";
import { useAuth } from "~/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { Edit2, Trash2, ArrowLeft } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Project Details - WantNot" },
    { name: "description", content: "View project details and transactions" },
  ];
}

export default function ProjectDetail() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <ProjectDetailPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getIdToken } = useAuth();
  const [project, setProject] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', color: '#8B5CF6', isActive: true });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchProject = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch('/api/projects', {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        const proj = data.projects.find((p: any) => p.id === id);
        if (proj) {
          setProject(proj);
          setFormData({
            name: proj.name,
            description: proj.description || '',
            color: proj.color || '#8B5CF6',
            isActive: proj.isActive,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching project:', error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const idToken = await getIdToken();
      if (!idToken) return;

      const response = await fetch(`/api/projects/${id}/transactions`, {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProject();
    fetchTransactions();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          color: formData.color,
          isActive: formData.isActive,
        }),
      });

      if (!response.ok) throw new Error('Failed to update project');

      setSuccessMessage('Project updated!');
      setEditing(false);
      await fetchProject();
    } catch (error) {
      console.error('Error updating project:', error);
      setErrorMessage('Failed to update project');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this project? This will remove the project from all transactions.')) return;

    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      const response = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (!response.ok) throw new Error('Failed to delete project');

      navigate('/projects');
    } catch (error) {
      console.error('Error deleting project:', error);
      setErrorMessage('Failed to delete project');
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <p className="text-red-600">Project not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/projects" className="inline-flex items-center text-gray-600 hover:text-[#41A6AC] mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Projects
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-6 h-6 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
            {!project.isActive && (
              <span className="text-sm px-2 py-1 bg-gray-200 text-gray-700 rounded">Archived</span>
            )}
          </div>
          <div className="flex gap-2">
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
        {project.description && (
          <p className="text-gray-600 mt-2">{project.description}</p>
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Project</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#41A6AC] focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="h-4 w-4 text-[#41A6AC] border-gray-300 rounded focus:ring-[#41A6AC]"
              />
              <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                Active Project
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
          <h2 className="text-lg font-semibold text-gray-900">Transactions in this project</h2>
          <p className="text-sm text-gray-600 mt-1">
            {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
          </p>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            No transactions in this project yet. Transactions will appear here once they are assigned to this project.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {transactions.map((txn) => (
              <div key={txn.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{txn.merchantName || txn.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-sm text-gray-500">
                      {new Date(txn.date).toLocaleDateString()}
                    </p>
                    {txn.categoryId && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                        Category assigned
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
