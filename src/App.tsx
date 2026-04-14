import React, { useState } from 'react';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { OrganizationSetup } from './components/OrganizationSetup';
import { UserDashboard } from './components/UserDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { Settings } from './components/Settings';
import { Toaster } from '@/components/ui/sonner';

type AppPage = 'dashboard' | 'settings';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [page, setPage] = useState<AppPage>('dashboard');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Login />;
  if (!profile) return <OrganizationSetup />;

  return (
    <Layout currentPage={page} onNavigate={(p) => setPage(p)}>
      {profile.role === 'admin'
        ? page === 'settings'
          ? <Settings />
          : <AdminDashboard />
        : <UserDashboard />
      }
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
        <Toaster position="top-right" />
      </AuthProvider>
    </ErrorBoundary>
  );
}
