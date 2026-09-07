'use client';

import { useState, type FormEvent } from 'react';
import {
  createTaskSchema,
  TASK_PRIORITIES,
  type ClientSummary,
  type CreateTaskInput,
  type MemberSummary,
  type ProjectSummary,
  type TaskPriorityName,
} from '@madre-pulse/shared';
import { FormField } from '../../components/form-field';

interface AddTaskModalProps {
  members: MemberSummary[];
  projects: ProjectSummary[];
  clients: ClientSummary[];
  onClose: () => void;
  onSubmit: (input: CreateTaskInput) => Promise<void>;
}

export function AddTaskModal({ members, projects, clients, onClose, onSubmit }: AddTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriorityName>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeMembers = members.filter((m) => m.status === 'ACTIVE');

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = createTaskSchema.safeParse({
      title,
      description,
      priority,
      dueDate,
      projectId: projectId || undefined,
      clientId: clientId || undefined,
      assigneeIds,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(parsed.data as CreateTaskInput);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add task.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8 sm:items-center">
      <div className="w-full max-w-lg rounded-card border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">Add a task</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-card p-1 text-muted hover:bg-surface-alt hover:text-text"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Title" value={title} onChange={setTitle} autoFocus />

          <label className="flex flex-col gap-1 text-sm text-text">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </label>

          <FormField label="Due date" type="date" value={dueDate} onChange={setDueDate} />

          <div className="flex flex-col gap-1 text-sm text-text">
            Assignee
            <div className="flex flex-col gap-1.5 rounded-card border border-border bg-surface-alt px-3 py-2">
              {activeMembers.length === 0 ? (
                <span className="text-xs text-muted">No active members yet.</span>
              ) : (
                activeMembers.map((m) => (
                  <label key={m.userId} className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(m.userId)}
                      onChange={() => toggleAssignee(m.userId)}
                    />
                    {m.name}
                  </label>
                ))
              )}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm text-text">
            Priority (optional)
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriorityName)}
              className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-text">
            Project (optional)
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-text">
            Client (optional)
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-card border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-alt"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
