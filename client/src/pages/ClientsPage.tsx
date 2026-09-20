import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import { useClients } from '../lib/queries';
import type { Client } from '../types';
import { Modal } from '../components/Modal';

function ClientForm({ client, onClose }: { client?: Client; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(client?.name ?? '');
  const [contactName, setContactName] = useState(client?.contactName ?? '');
  const [contactEmail, setContactEmail] = useState(client?.contactEmail ?? '');
  const [error, setError] = useState<Error | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), contactName: contactName.trim() || null, contactEmail: contactEmail.trim() || null };
      return client ? api(`/clients/${client.id}`, { method: 'PATCH', body }) : api('/clients', { method: 'POST', body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
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
      title={client ? 'Edit client' : 'New client'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" form="client-form" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save client'}
          </button>
        </>
      }
    >
      <form id="client-form" className="stack" onSubmit={submit} noValidate>
        {error && !Object.keys(fields).length && <div className="form-error">{error.message}</div>}
        <div className="field">
          <label htmlFor="c-name">Client name</label>
          <input id="c-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {fields.name && <span className="error-text">{fields.name}</span>}
        </div>
        <div className="field">
          <label htmlFor="c-contact">Main contact</label>
          <input id="c-contact" className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="c-email">Contact email</label>
          <input id="c-email" className="input" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          {fields.contactEmail && <span className="error-text">{fields.contactEmail}</span>}
        </div>
      </form>
    </Modal>
  );
}

export function ClientsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useClients();
  const [editing, setEditing] = useState<Client | 'new' | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => api(`/clients/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleteError(null);
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => setDeleteError((e as Error).message),
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p>The companies your projects are delivered for.</p>
        </div>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setEditing('new')}>
          New client
        </button>
      </div>
      {deleteError && <div className="form-error" style={{ marginBottom: 14 }}>{deleteError}</div>}
      <div className="panel">
        {isLoading && <div className="empty">Loading clients…</div>}
        {error && <div className="empty">{(error as Error).message}</div>}
        {data && data.length === 0 && <div className="empty">No clients yet.</div>}
        {data && data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Projects</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <b>{c.name}</b>
                    </td>
                    <td>
                      {c.contactName ?? <span className="muted">No contact</span>}
                      {c.contactEmail && <div className="muted small">{c.contactEmail}</div>}
                    </td>
                    <td className="num">{c.projectCount}</td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn small" onClick={() => setEditing(c)}>
                          Edit
                        </button>
                        <button className="btn small danger" onClick={() => window.confirm(`Delete ${c.name}?`) && remove.mutate(c.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && <ClientForm client={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
