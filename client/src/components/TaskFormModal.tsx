import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import { useDevelopers, useProjects } from '../lib/queries';
import { dateInputValue } from '../lib/format';
import { PRIORITY_LABEL } from '../lib/format';
import { PRIORITIES, type Priority, type Task } from '../types';
import { Modal } from './Modal';

interface Props {
  onClose: () => void;
  task?: Task; // present = edit
  projectId?: number; // fixed project when creating from a project page
}

export function TaskFormModal({ onClose, task, projectId }: Props) {
  const queryClient = useQueryClient();
  const developers = useDevelopers();
  const projects = useProjects();
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [assigneeId, setAssigneeId] = useState<string>(task?.assignee ? String(task.assignee.id) : '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'MEDIUM');
  const [dueDate, setDueDate] = useState(dateInputValue(task?.dueDate ?? null));
  const [project, setProject] = useState<string>(String(projectId ?? task?.project.id ?? ''));
  const [error, setError] = useState<ApiError | Error | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const common = { title: title.trim(), description: description.trim(), priority, assigneeId: assigneeId ? Number(assigneeId) : null };
      return task
        ? api(`/tasks/${task.id}`, { method: 'PATCH', body: { ...common, dueDate: dueDate || null } })
        : api('/tasks', { method: 'POST', body: { ...common, projectId: Number(project), ...(dueDate ? { dueDate } : {}) } });
    },
    onSuccess: () => {
      for (const key of ['tasks', 'task', 'projects', 'project', 'dashboard']) void queryClient.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: (e) => setError(e as Error),
  });

  const fields = error instanceof ApiError ? error.fieldErrors : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError(new ApiError(400, 'VALIDATION_ERROR', 'Enter a task title', [{ path: 'title', message: 'Enter a task title' }]));
    if (!task && !project) return setError(new ApiError(400, 'VALIDATION_ERROR', 'Choose a project', [{ path: 'projectId', message: 'Choose a project' }]));
    save.mutate();
  };

  return (
    <Modal
      title={task ? `Edit Task #${task.id}` : 'New task'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" form="task-form" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </button>
        </>
      }
    >
      <form id="task-form" className="form-grid" onSubmit={submit} noValidate>
        {error && !Object.keys(fields).length && <div className="form-error full">{error.message}</div>}
        <div className="field full">
          <label htmlFor="t-title">Title</label>
          <input id="t-title" className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} autoFocus />
          {fields.title && <span className="error-text">{fields.title}</span>}
        </div>
        {!task && !projectId && (
          <div className="field full">
            <label htmlFor="t-project">Project</label>
            <select id="t-project" className="select" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">Choose a project</option>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.client.name})
                </option>
              ))}
            </select>
            {fields.projectId && <span className="error-text">{fields.projectId}</span>}
          </div>
        )}
        <div className="field full">
          <label htmlFor="t-desc">Description</label>
          <textarea id="t-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          {fields.description && <span className="error-text">{fields.description}</span>}
        </div>
        <div className="field">
          <label htmlFor="t-assignee">Assignee</label>
          <select id="t-assignee" className="select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {developers.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {fields.assigneeId && <span className="error-text">{fields.assigneeId}</span>}
        </div>
        <div className="field">
          <label htmlFor="t-priority">Priority</label>
          <select id="t-priority" className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-due">Due date</label>
          <input id="t-due" className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          {fields.dueDate && <span className="error-text">{fields.dueDate}</span>}
        </div>
      </form>
    </Modal>
  );
}
