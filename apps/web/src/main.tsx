import { I18nProvider, type Locale, t, tr } from './i18n';
import { StrictMode, useCallback, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { ConfirmProvider } from './components/shared/ConfirmDialog';
import { ToastProvider } from './components/toast';
import { Layout, Notice, PageState } from './components/ui';
import './index.css';
import { api } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { configured } from './lib/supabase';
import { installPrintTheme } from './lib/theme';
import { AcceptInvite } from './pages/AcceptInvite';
import { AuthCallback, ForgotPassword, LogIn, MyAccount, ResetPassword, SignUp } from './pages/Account';
import { EventPage } from './pages/EventPage';
import { ExploreEvents } from './pages/ExploreEvents';
import { InterviewHome } from './pages/InterviewHome';
import { InterviewPage } from './pages/InterviewPage';
import { Landing } from './pages/Landing';
import { IntegrityReview } from './pages/org/CourseMode';
import { AssignmentConsole, AssignmentSubmissionPage } from './pages/org/AssignmentConsole';
import { CoursePage, CoursesHome, NewAssignment } from './pages/org/Courses';
import { MyAssignmentPage, MyCourse, MyCourses } from './pages/MyCourses';
import { CreateEvent } from './pages/org/CreateEvent';
import { EventConsole } from './pages/org/EventConsole';
import { OrgEvents } from './pages/org/OrgEvents';
import { OrgSettings } from './pages/org/OrgSettings';
import { SimilarityCompare } from './pages/org/SimilarityCompare';
import { SubmissionDetail } from './pages/org/SubmissionDetail';
import { PublicProfile } from './pages/PublicProfile';

function Private({ children, organizer = false }: { children: ReactNode; organizer?: boolean }) {
  const { session, loading, org } = useAuth();
  const location = useLocation();
  if (loading) return <PageState loading error={null} />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (organizer && !org) return <Notice tone="error">{tr('This area is for organizers. Create an organizer account to run events.')}</Notice>;
  return <>{children}</>;
}

/** Old links to the per-event gradebook now open the integrity review of that event. */
function GradebookRedirect() {
  const { id } = useParams();
  return <Navigate to={`/org/integrity/${id}`} replace />;
}

/** The language: the account's once signed in (a change is saved to it), otherwise this browser's. */
function Localized({ children }: { children: ReactNode }) {
  const { session, me } = useAuth();
  const save = useCallback(
    (l: Locale) => {
      if (session) void api('/api/me/profile', { method: 'PATCH', body: { locale: l } }).catch(() => {});
    },
    [session],
  );
  return (
    <I18nProvider accountLocale={me?.profile.locale ?? null} onChange={save}>
      {children}
    </I18nProvider>
  );
}

function App() {
  return (
    <Layout>
      {!configured && <div className="mb-4"><Notice tone="warn">{tr('Supabase is not configured. Copy apps/web/.env.example to .env and fill it in.')}</Notice></div>}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<LogIn />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/p/:slug" element={<PublicProfile />} />
        <Route path="/invite/:token" element={<Private><AcceptInvite /></Private>} />
        <Route path="/me" element={<Private><MyAccount /></Private>} />
        <Route path="/events" element={<Private><ExploreEvents /></Private>} />
        <Route path="/e/:slug" element={<Private><EventPage /></Private>} />
        <Route path="/interviews" element={<Private><InterviewHome /></Private>} />
        <Route path="/interview/new" element={<Private><InterviewHome /></Private>} />
        <Route path="/interview/:id" element={<Private><InterviewPage /></Private>} />
        <Route path="/org/events" element={<Private organizer><OrgEvents /></Private>} />
        <Route path="/courses" element={<Private><MyCourses /></Private>} />
        <Route path="/courses/:id" element={<Private><MyCourse /></Private>} />
        <Route path="/courses/:id/a/:aid" element={<Private><MyAssignmentPage /></Private>} />
        <Route path="/org/courses" element={<Private organizer><CoursesHome /></Private>} />
        <Route path="/org/courses/:courseId" element={<Private organizer><CoursePage /></Private>} />
        <Route path="/org/courses/:courseId/assignments/new" element={<Private organizer><NewAssignment /></Private>} />
        <Route path="/org/courses/:courseId/assignments/:id" element={<Private organizer><AssignmentConsole /></Private>} />
        <Route path="/org/courses/:courseId/assignments/:id/s/:sid" element={<Private organizer><AssignmentSubmissionPage /></Private>} />
        <Route path="/org/courses/:courseId/:tab" element={<Private organizer><CoursePage /></Private>} />
        <Route path="/org/integrity" element={<Private organizer><IntegrityReview /></Private>} />
        <Route path="/org/integrity/:id" element={<Private organizer><IntegrityReview /></Private>} />
        <Route path="/org/settings" element={<Private organizer><OrgSettings /></Private>} />
        <Route path="/org/events/new" element={<Private organizer><CreateEvent /></Private>} />
        <Route path="/org/events/:id" element={<Private organizer><EventConsole /></Private>} />
        <Route path="/org/events/:id/compare" element={<Private organizer><SimilarityCompare /></Private>} />
        <Route path="/org/events/:id/gradebook" element={<Private organizer><GradebookRedirect /></Private>} />
        <Route path="/org/events/:id/s/:sid" element={<Private organizer><SubmissionDetail /></Private>} />
        <Route path="*" element={<Notice tone="error">{t('common.pageNotFound')}</Notice>} />
      </Routes>
    </Layout>
  );
}

installPrintTheme();

// Printing opens every folded section (transcripts, details), and folds them back afterwards.
window.addEventListener('beforeprint', () => {
  document.querySelectorAll('details:not([open])').forEach((d) => {
    d.setAttribute('open', '');
    d.setAttribute('data-print-opened', '');
  });
});
window.addEventListener('afterprint', () => {
  document.querySelectorAll('details[data-print-opened]').forEach((d) => {
    d.removeAttribute('open');
    d.removeAttribute('data-print-opened');
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Localized>
          <ToastProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </ToastProvider>
        </Localized>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
