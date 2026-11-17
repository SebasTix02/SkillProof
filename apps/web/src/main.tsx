import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/toast';
import { Layout, Notice, Spinner } from './components/ui';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { configured } from './lib/supabase';
import { AuthCallback, ForgotPassword, LogIn, MyAccount, ResetPassword, SignUp } from './pages/Account';
import { EventPage } from './pages/EventPage';
import { ExploreEvents } from './pages/ExploreEvents';
import { InterviewHome } from './pages/InterviewHome';
import { InterviewPage } from './pages/InterviewPage';
import { Landing } from './pages/Landing';
import { CreateEvent } from './pages/org/CreateEvent';
import { EventConsole } from './pages/org/EventConsole';
import { OrgEvents } from './pages/org/OrgEvents';
import { SubmissionDetail } from './pages/org/SubmissionDetail';
import { PublicProfile } from './pages/PublicProfile';

function Private({ children, organizer = false }: { children: ReactNode; organizer?: boolean }) {
  const { session, loading, org } = useAuth();
  const location = useLocation();
  if (loading) return <div className="py-16 text-center"><Spinner /></div>;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (organizer && !org) return <Notice tone="error">This area is for organizers. Create an organizer account to run events.</Notice>;
  return <>{children}</>;
}

function App() {
  return (
    <Layout>
      {!configured && <div className="mb-4"><Notice tone="warn">Supabase is not configured. Copy apps/web/.env.example to .env and fill it in.</Notice></div>}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<LogIn />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/p/:slug" element={<PublicProfile />} />
        <Route path="/me" element={<Private><MyAccount /></Private>} />
        <Route path="/events" element={<Private><ExploreEvents /></Private>} />
        <Route path="/e/:slug" element={<Private><EventPage /></Private>} />
        <Route path="/interview/new" element={<Private><InterviewHome /></Private>} />
        <Route path="/interview/:id" element={<Private><InterviewPage /></Private>} />
        <Route path="/org/events" element={<Private organizer><OrgEvents /></Private>} />
        <Route path="/org/events/new" element={<Private organizer><CreateEvent /></Private>} />
        <Route path="/org/events/:id" element={<Private organizer><EventConsole /></Private>} />
        <Route path="/org/events/:id/s/:sid" element={<Private organizer><SubmissionDetail /></Private>} />
        <Route path="*" element={<Notice tone="error">Page not found.</Notice>} />
      </Routes>
    </Layout>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
