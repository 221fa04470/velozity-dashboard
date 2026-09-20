import { useAuth } from '../auth/AuthContext';
import { ActivityFeed } from '../components/ActivityFeed';

export function ActivityPage() {
  const { user } = useAuth();
  const scope = user?.role === 'ADMIN' ? 'Everything happening across all projects.' : user?.role === 'PROJECT_MANAGER' ? 'Updates from the projects you manage.' : 'Updates on the tasks assigned to you.';
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p>{scope}</p>
        </div>
      </div>
      <div style={{ maxWidth: 820 }}>
        <ActivityFeed title={user?.role === 'ADMIN' ? 'Global feed' : 'Your feed'} />
      </div>
    </>
  );
}
