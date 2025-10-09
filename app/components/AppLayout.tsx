import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '~/contexts/AuthContext';
import { CreditCard, FolderOpen, Briefcase, LogOut, ChevronLeft, ChevronRight, Menu, X, LayoutDashboard } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const { user, logout, getIdToken } = useAuth();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/transactions', label: 'Transactions', icon: CreditCard, badge: uncategorizedCount },
    { path: '/categories', label: 'Categories', icon: FolderOpen },
    { path: '/projects', label: 'Projects', icon: Briefcase },
  ];

  const isActive = (path: string) => location.pathname === path;

  // Fetch uncategorized count
  useEffect(() => {
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

    fetchUncategorizedCount();
    // Refresh every 3 seconds for more responsive badge updates
    const interval = setInterval(fetchUncategorizedCount, 3000);

    // Listen for custom events to refresh immediately
    const handleRefresh = () => fetchUncategorizedCount();
    window.addEventListener('transaction-updated', handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('transaction-updated', handleRefresh);
    };
  }, [getIdToken, location.pathname]); // Also refresh when location changes

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 bg-white rounded-lg shadow-md hover:bg-gray-50 transition-colors"
        >
          {isMobileOpen ? (
            <X className="w-5 h-5 text-gray-700" />
          ) : (
            <Menu className="w-5 h-5 text-gray-700" />
          )}
        </button>
      </div>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-40 transition-all duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed ? 'lg:w-16' : 'lg:w-64'} w-64`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className={`p-4 border-b border-gray-200 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold text-[#41A6AC] truncate">WantNot</h1>
                <p className="text-xs text-gray-600 truncate">{user?.displayName || user?.email}</p>
              </div>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:block p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const showBadge = item.badge && item.badge > 0;
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={() => setIsMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors relative ${
                        isActive(item.path)
                          ? 'bg-[#41A6AC] text-white'
                          : 'text-gray-700 hover:bg-gray-100'
                      } ${isCollapsed ? 'justify-center' : ''}`}
                      title={isCollapsed ? item.label : ''}
                    >
                      <div className="relative">
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        {showBadge && isCollapsed && (
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
                        )}
                      </div>
                      {!isCollapsed && (
                        <span className="font-medium text-sm flex-1">{item.label}</span>
                      )}
                      {showBadge && !isCollapsed && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          isActive(item.path)
                            ? 'bg-white/20 text-white'
                            : 'bg-red-500 text-white'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Footer */}
          <div className="p-2 border-t border-gray-200">
            <button
              onClick={logout}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors ${
                isCollapsed ? 'justify-center' : ''
              }`}
              title={isCollapsed ? 'Sign out' : ''}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span className="font-medium text-sm">Sign out</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`lg:transition-all lg:duration-300 min-h-screen ${isCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
        {children}
      </main>
    </div>
  );
}
