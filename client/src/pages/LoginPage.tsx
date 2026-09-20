import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const DEMO = [
  { label: 'Admin', name: 'Anita Rao', email: 'admin@velozity.dev' },
  { label: 'Project manager', name: 'Priya Nair', email: 'priya@velozity.dev' },
  { label: 'Project manager', name: 'Rohan Mehta', email: 'rohan@velozity.dev' },
  { label: 'Developer', name: 'Ravi Kumar', email: 'ravi@velozity.dev' },
  { label: 'Developer', name: 'Meera Iyer', email: 'meera@velozity.dev' },
];

export function LoginPage() {
  const { login, status } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authed') return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-form" onSubmit={submit} noValidate>
        <div>
          <h1>Sign in to Velozity</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Projects, tasks and team activity in one live view.
          </p>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn primary" disabled={busy || !email || !password} style={{ justifyContent: 'center' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="login-art">
        <h2>See every task move, the moment it moves.</h2>
        <p>
          Demo accounts (password <b style={{ color: '#fff' }}>Password123!</b>). Pick one to fill the form, then open a second browser window as another role to watch updates arrive live.
        </p>
        <div className="demo">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => {
                setEmail(d.email);
                setPassword('Password123!');
              }}
            >
              <span>
                <b>{d.name}</b>
                <small>{d.label}</small>
              </span>
              <span className="spacer" />
              <small>{d.email}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
