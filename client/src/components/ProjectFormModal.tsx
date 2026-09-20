import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useClients } from '../lib/queries';
import type { DirectoryUser, Project } from '../types';
import { Modal } from './Modal';

export function ProjectFormModal({ project, onClose, onSaved }: { project?: Project; onClose: () => void; onSaved?: (p: Project) => void }) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const queryClient = useQueryClient();
  const clients = useClients();
  const managers = useQuery({
    queryKey: ['users', 'managers'],
    enabled: isAdmin,
    queryFn: async () => (await api<{ data: DirectoryUser[] }>('/users', { query: { role: 'PROJECT_MANAGER', active: true } })).data,
  });
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [clientId, setClientId] = useState(project ? String(project.client.id) : '');
  const [ownerId, setOwnerId] = useState(project ? String(project.createdBy.id) : '');
  const [error, setError] = useState<Error | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim(), clientId: Number(clientId), ...(isAdmin && ownerId ? { createdById: Number(ownerId) } : {}) };
      return project ? api<Project>(`/projects/${project.id}`, { method: 'PATCH', body }) : api<Project>('/projects', { method: 'POST', body });
    },
    onSuccess: (saved) => {
      for (const key of ['projects', 'project', 'dashboard']) void queryClient.invalidateQueries({ queryKey: [key] });
      onSaved?.(saved);
      onClose();
    },
    onError: (e) => setError(e as Error),
  });

  const fields = error instanceof ApiError ? error.fieldErrors : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError(new ApiError(400, 'VALIDATION_ERROR', 'Enter a project name', [{ path: 'name', message: 'Enter a project name' }]));
    if (!clientId) return setError(new ApiError(400, 'VALIDATION_ERROR', 'Choose a client', [{ path: 'clientId', message: 'Choose a client' }]));
    save.mutate();
  };

  return (
    <Modal
      title={project ? 'Edit project' : 'New project'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" form="project-form" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : project ? 'Save changes' : 'Create project'}
          </button>
        </>
      }
    >
      <form id="project-form" className="form-grid" onSubmit={submit} noValidate>
        {error && !Object.keys(fields).length && <div className="form-error full">{error.message}</div>}
        <div className="field full">
          <label htmlFor="p-name">Project name</label>
          <input id="p-name" className="input" value={name} maxLength={150} onChange={(e) => setName(e.target.value)} autoFocus />
          {fields.name && <span className="error-text">{fields.name}</span>}
        </div>
        <div className="field">
          <label htmlFor="p-client">Client</label>
          <select id="p-client" className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Choose a client</option>
            {clients.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {fields.clientId && <span className="error-text">{fields.clientId}</span>}
        </div>
        {isAdmin && (
          <div className="field">
            <label htmlFor="p-owner">Project manager</label>
            <select id="p-owner" className="select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">{project ? project.createdBy.name : 'Me (admin)'}</option>
              {managers.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field full">
          <label htmlFor="p-desc">Description</label>
          <textarea id="p-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
