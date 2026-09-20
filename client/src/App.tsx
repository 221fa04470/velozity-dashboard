import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import type { Role } from './types';
import { ActivityPage } from './pages/ActivityPage';
import { ClientsPage } from './pages/ClientsPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TasksPage } from './pages/TasksPage';
import { TeamPage } from './pages/TeamPage';

function RequireAuth({ roles, children }: { roles?: Role[]; children: JSX.Element }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <div className="empty" style={{ paddingTop: 120 }}>Loading…</div>;
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  // UX only. The API enforces roles independently; hiding a page is never the security boundary.
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route
          path="clients"
          element={
            <RequireAuth roles={['ADMIN']}>
              <ClientsPage />
            </RequireAuth>
          }
        />
        <Route
          path="team"
          element={
            <RequireAuth roles={['ADMIN']}>
              <TeamPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
