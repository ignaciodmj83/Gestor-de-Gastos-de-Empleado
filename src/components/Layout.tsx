import React from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { LogOut, Building2 } from 'lucide-react';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* FIXED: border-b (was border-bottom which is not a Tailwind class) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm shadow-slate-100/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
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

          {user && (
            <div className="flex items-center gap-3">
              {/* User avatar + info */}
              <div className="flex items-center gap-3">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={profile?.name || user.displayName || ''}
                    className="w-8 h-8 rounded-full border-2 border-slate-100 object-cover"
                  />
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

              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                title="Cerrar Sesión"
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
