import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL } from '../lib/format';
import type { DirectoryUser, Role } from '../types';
import { Modal } from '../components/Modal';

const ROLES: Role[] = ['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER'];

function UserForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('DEVELOPER');
  const [error, setError] = useState<Error | null>(null);
  const save = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: { name: name.trim(), email: email.trim(), password, role } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e) => setError(e as Error),
  });
  const fields = error instanceof ApiError ? error.fieldErrors : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate();
  };
  return (
    <Modal
      title="Add team member"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" form="user-form" disabled={save.isPending}>
            {save.isPending ? 'Adding…' : 'Add member'}
          </button>
        </>
      }
    >
      <form id="user-form" className="form-grid" onSubmit={submit} noValidate>
        {error && !Object.keys(fields).length && <div className="form-error full">{error.message}</div>}
        <div className="field">
          <label htmlFor="u-name">Full name</label>
          <input id="u-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {fields.name && <span className="error-text">{fields.name}</span>}
        </div>
        <div className="field">
          <label htmlFor="u-role">Role</label>
          <select id="u-role" className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="u-email">Email</label>
          <input id="u-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {fields.email && <span className="error-text">{fields.email}</span>}
        </div>
        <div className="field">
          <label htmlFor="u-pass">Temporary password</label>
          <input id="u-pass" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {fields.password && <span className="error-text">{fields.password}</span>}
        </div>
      </form>
    </Modal>
  );
}

export function TeamPage() {
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: async () => (await api<{ data: DirectoryUser[] }>('/users')).data,
  });
  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: number; role?: Role; isActive?: boolean }) => api(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p>Accounts and roles. Changing a role or deactivating someone signs them out everywhere.</p>
        </div>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setAdding(true)}>
          Add team member
        </button>
      </div>
      {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="panel">
        {isLoading && <div className="empty">Loading team…</div>}
        {data && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.name}</b>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <select className="select" style={{ width: 170 }} value={u.role} disabled={u.id === me?.id || patch.isPending} onChange={(e) => patch.mutate({ id: u.id, role: e.target.value as Role })} aria-label={`Role for ${u.name}`}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button className="btn small" disabled={u.id === me?.id || patch.isPending} onClick={() => patch.mutate({ id: u.id, isActive: !u.isActive })}>
                        {u.isActive ? 'Active. Deactivate' : 'Inactive. Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {adding && <UserForm onClose={() => setAdding(false)} />}
    </>
  );
}
