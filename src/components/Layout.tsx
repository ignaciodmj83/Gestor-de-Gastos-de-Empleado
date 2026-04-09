import React from 'react';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/button';
import { LogOut, Building2, User as UserIcon } from 'lucide-react';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, profile, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-bottom border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-2 rounded-lg">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Km & Tickets Pro</h1>
              {profile && (
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  {profile.organizationName || 'Cargando...'} | ID: {profile.organizationId}
                </p>
              )}
            </div>
          </div>

          {user && (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-medium">{profile?.name || user.displayName}</span>
                <span className="text-[10px] text-muted-foreground uppercase">{profile?.role === 'admin' ? 'Administrador' : 'Usuario'}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={logout} title="Cerrar Sesión">
                <LogOut className="w-5 h-5" />
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
