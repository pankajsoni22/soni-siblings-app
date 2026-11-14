import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireRole from './auth/RequireRole.tsx';
import { useAuth } from './auth/useAuth.ts';
import Nav from './components/Nav.tsx';
import SessionExpiredDialog from './components/SessionExpiredDialog.tsx';
import TopBar from './components/TopBar.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import NoAccessPage from './pages/NoAccessPage.tsx';
import Placeholder from './pages/Placeholder.tsx';
import SignInPage from './pages/SignInPage.tsx';

export default function App() {
  const { status } = useAuth();

  let content: ReactNode;
  switch (status) {
    case 'loading':
      content = <main><p className="muted center-text">Loading…</p></main>;
      break;
    case 'checking':
      content = <main><p className="muted center-text">Checking access…</p></main>;
      break;
    case 'signedOut':
      content = <main><SignInPage /></main>;
      break;
    case 'forbidden':
      content = <main><NoAccessPage /></main>;
      break;
    case 'ready':
    case 'expired':
      // Keep the app mounted while expired so unsaved work survives a re-sign-in.
      content = (
        <div className="shell">
          <Nav />
          <main className="shell-main">
            <AppRoutes />
          </main>
        </div>
      );
      break;
  }

  return (
    <>
      <TopBar />
      {content}
      {status === 'expired' && <SessionExpiredDialog />}
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/transactions" element={
        <Placeholder title="Transactions" phase={4}>Search, filter by status, mark repaid, edit, delete with undo, and export CSV.</Placeholder>
      } />
      <Route path="/transactions/new" element={
        <RequireRole action="saveTransaction">
          <Placeholder title="New entry" phase={4}>The form with live commission and partner earnings.</Placeholder>
        </RequireRole>
      } />
      <Route path="/transactions/:id/edit" element={
        <RequireRole action="saveTransaction">
          <Placeholder title="Edit entry" phase={4}>The same form, pre-filled.</Placeholder>
        </RequireRole>
      } />
      <Route path="/partners" element={
        <RequireRole action="listPartners">
          <Placeholder title="Partners" phase={5}>Partners, default shares and the 100% check.</Placeholder>
        </RequireRole>
      } />
      <Route path="/users" element={
        <RequireRole action="listUsers">
          <Placeholder title="Users" phase={5}>Who can sign in, and their roles.</Placeholder>
        </RequireRole>
      } />
      <Route path="/settings" element={
        <RequireRole action="saveSettings">
          <Placeholder title="Settings" phase={5}>The default commission rate.</Placeholder>
        </RequireRole>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
