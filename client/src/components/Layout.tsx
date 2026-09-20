import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useSocket } from '../realtime/SocketProvider';
import { ROLE_LABEL } from '../lib/format';
import { NotificationBell } from './NotificationBell';

export function Layout() {
  const { user, logout, hasRole } = useAuth();
  const { connected } = useSocket();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden>
              <path d="M8 10l8 13 8-13" fill="none" stroke="#C8F03C" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Velozity
        </div>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/tasks">{hasRole('DEVELOPER') ? 'My tasks' : 'Tasks'}</NavLink>
          <NavLink to="/activity">Activity</NavLink>
          {hasRole('ADMIN') && <NavLink to="/clients">Clients</NavLink>}
          {hasRole('ADMIN') && <NavLink to="/team">Team</NavLink>}
        </nav>
        <div className="side-foot">Internal tool for the Velozity delivery team.</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="live">
            <span className={`dot${connected ? ' on' : ''}`} />
            {connected ? 'Connected live' : 'Reconnecting…'}
          </span>
          <span className="spacer" />
          <NotificationBell />
          <div style={{ textAlign: 'right', lineHeight: 1.25 }}>
            <div style={{ fontWeight: 600 }}>{user?.name}</div>
            <div className="muted small">{user && ROLE_LABEL[user.role]}</div>
          </div>
          <button className="btn small" onClick={() => void logout()}>
            Sign out
          </button>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
