import React from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { LogOut, Building2, Settings as SettingsIcon, LayoutDashboard } from 'lucide-react';

type AppPage = 'dashboard' | 'settings';

interface LayoutProps {
  children: React.ReactNode;
  currentPage?: AppPage;
  onNavigate?: (page: AppPage) => void;
}

export function Layout({ children, currentPage = 'dashboard', onNavigate }: LayoutProps) {
  const { user, profile, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm shadow-slate-100/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-xl">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight leading-tight">Km &amp; Tickets Pro</h1>
              {profile && (
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider leading-tight">
                  {profile.organizationName || profile.organizationId}
                </p>
              )}
            </div>
          </div>

          {/* Nav + user */}
          {user && (
            <div className="flex items-center gap-2">
              {/* Admin navigation tabs */}
              {profile?.role === 'admin' && onNavigate && (
                <div className="hidden sm:flex items-center gap-1 bg-slate-100 p-1 rounded-xl mr-2">
                  <button
                    onClick={() => onNavigate('dashboard')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      currentPage === 'dashboard'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" /> Panel
                  </button>
                  <button
                    onClick={() => onNavigate('settings')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      currentPage === 'settings'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <SettingsIcon className="w-3.5 h-3.5" /> Configuración
                  </button>
                </div>
              )}

              {/* User avatar */}
              <div className="flex items-center gap-2.5">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={profile?.name || ''} className="w-8 h-8 rounded-full border-2 border-slate-100 object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">
                    {(profile?.name || user.displayName || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="hidden sm:flex flex-col">
                  <span className="text-sm font-semibold leading-tight">{profile?.name || user.displayName}</span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider leading-tight">
                    {profile?.role === 'admin' ? 'Administrador' : 'Empleado'}
                  </span>
                </div>
              </div>

              <Button variant="ghost" size="icon" onClick={logout} title="Cerrar Sesión"
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl ml-1">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Mobile nav for admin */}
        {profile?.role === 'admin' && onNavigate && (
          <div className="sm:hidden flex border-t border-slate-100">
            {[
              { id: 'dashboard', label: 'Panel', icon: LayoutDashboard },
              { id: 'settings', label: 'Config', icon: SettingsIcon },
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => onNavigate(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-all ${
                  currentPage === id ? 'text-primary border-b-2 border-primary' : 'text-slate-400'
                }`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
