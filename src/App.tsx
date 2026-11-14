import { useRef, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireRole from './auth/RequireRole.tsx';
import { useAuth } from './auth/useAuth.ts';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import Nav from './components/Nav.tsx';
import OfflineBanner from './components/OfflineBanner.tsx';
import { useFocusOnNavigate } from './components/useFocusOnNavigate.ts';
import SessionExpiredDialog from './components/SessionExpiredDialog.tsx';
import TopBar from './components/TopBar.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import NoAccessPage from './pages/NoAccessPage.tsx';
import DeletedPage from './pages/DeletedPage.tsx';
import PartnersPage from './pages/PartnersPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';
import SignInPage from './pages/SignInPage.tsx';
import UsersPage from './pages/UsersPage.tsx';
import TransactionFormPage from './pages/TransactionFormPage.tsx';
import TransactionsPage from './pages/TransactionsPage.tsx';

export default function App() {
  const { status } = useAuth();

  let content: ReactNode;
  switch (status) {
    case 'loading':
      content = <main id="main"><p className="muted center-text">Loading…</p></main>;
      break;
    case 'checking':
      content = <main id="main"><p className="muted center-text">Checking access…</p></main>;
      break;
    case 'signedOut':
      content = <main id="main"><SignInPage /></main>;
      break;
    case 'forbidden':
      content = <main id="main"><NoAccessPage /></main>;
      break;
    case 'ready':
    case 'expired':
      // Keep the app mounted while expired so unsaved work survives a re-sign-in.
      content = <Shell />;
      break;
  }

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <TopBar />
      <OfflineBanner />
      <ErrorBoundary>{content}</ErrorBoundary>
      {status === 'expired' && <SessionExpiredDialog />}
    </>
  );
}

function Shell() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusOnNavigate(mainRef);
  return (
    <div className="shell">
      <Nav />
      <main id="main" ref={mainRef} className="shell-main">
        <AppRoutes />
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/transactions" element={<TransactionsPage />} />
      <Route path="/transactions/new" element={
        <RequireRole action="saveTransaction"><TransactionFormPage /></RequireRole>
      } />
      <Route path="/transactions/:id/edit" element={
        <RequireRole action="saveTransaction"><TransactionFormPage /></RequireRole>
      } />
      <Route path="/transactions/deleted" element={
        <RequireRole action="getHistory"><DeletedPage /></RequireRole>
      } />
      <Route path="/partners" element={<RequireRole action="listPartners"><PartnersPage /></RequireRole>} />
      <Route path="/users" element={<RequireRole action="listUsers"><UsersPage /></RequireRole>} />
      <Route path="/settings" element={<RequireRole action="saveSettings"><SettingsPage /></RequireRole>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
