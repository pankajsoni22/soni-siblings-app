import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth.ts';
import SessionExpiredDialog from './components/SessionExpiredDialog.tsx';
import TopBar from './components/TopBar.tsx';
import HomePage from './pages/HomePage.tsx';
import NoAccessPage from './pages/NoAccessPage.tsx';
import SignInPage from './pages/SignInPage.tsx';

export default function App() {
  const { status } = useAuth();

  let content: ReactNode;
  switch (status) {
    case 'loading':
      content = <p className="muted center-text">Loading…</p>;
      break;
    case 'checking':
      content = <p className="muted center-text">Checking access…</p>;
      break;
    case 'signedOut':
      content = <SignInPage />;
      break;
    case 'forbidden':
      content = <NoAccessPage />;
      break;
    case 'ready':
    case 'expired':
      // Keep the app mounted while expired so unsaved work survives a re-sign-in.
      content = (
        <Routes>
          <Route path="/" element={<HomePage />} />
          {/* One route per entity from the functional spec, e.g. /items and /items/:id */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      );
      break;
  }

  return (
    <>
      <TopBar />
      <main>{content}</main>
      {status === 'expired' && <SessionExpiredDialog />}
    </>
  );
}
