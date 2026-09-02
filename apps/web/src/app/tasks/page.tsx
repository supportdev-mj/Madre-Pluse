'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  createTaskSchema,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type MemberSummary,
  type ProjectSummary,
  type TaskPriorityName,
  type TaskStatusName,
  type TaskSummary,
} from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { FormField } from '../../components/form-field';
import { apiFetch } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';
import { TaskBoardView } from './task-board-view';
import { TaskCalendarView } from './task-calendar-view';

type TaskView = 'list' | 'board' | 'calendar';

const STATUS_LABELS: Record<TaskStatusName, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

function formatDueDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function TasksPage() {
  const { status, role, user } = useRequireAuth();
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<TaskView>('list');
  const [statusFilter, setStatusFilter] = useState<TaskStatusName | ''>('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriorityName>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function loadTasks() {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (assigneeFilter) params.set('assigneeId', assigneeFilter);
    const qs = params.toString();
    const data = await apiFetch<TaskSummary[]>(`/tasks${qs ? `?${qs}` : ''}`);
    setTasks(data);
  }

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    Promise.all([apiFetch<MemberSummary[]>('/members'), apiFetch<ProjectSummary[]>('/projects')])
      .then(([m, p]) => {
        setMembers(m);
        setProjects(p);
      })
      .then(loadTasks)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load tasks'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    loadTasks().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load tasks'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, assigneeFilter]);

  async function onAddTask(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = createTaskSchema.safeParse({
      title,
      description: description || undefined,
      priority,
      dueDate: dueDate || undefined,
      projectId: projectId || undefined,
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }

    setSubmitting(true);
    try {
      const task = await apiFetch<TaskSummary>('/tasks', { method: 'POST', body: JSON.stringify(parsed.data) });
      setTasks((prev) => [task, ...prev]);
      setTitle('');
      setDescription('');
      setPriority('MEDIUM');
      setDueDate('');
      setProjectId('');
      setAssigneeIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add task.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onStatusChange(task: TaskSummary, nextStatus: TaskStatusName) {
    setError(null);
    try {
      const updated = await apiFetch<TaskSummary>(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task.');
    }
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task.');
    }
  }

  if (status !== 'authenticated') return null;

  const canDelete = role === 'ADMIN' || role === 'MANAGER';
  const activeMembers = members.filter((m) => m.status === 'ACTIVE');

  function canEdit(task: TaskSummary): boolean {
    return canDelete || task.assignees.some((a) => a.userId === user?.id) || task.createdById === user?.id;
  }

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  return (
    <div className="min-h-screen sm:pl-60">
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-text">Tasks</h1>
          <div className="flex overflow-hidden rounded-card border border-border text-sm">
            {(['list', 'board', 'calendar'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 capitalize ${view === v ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-text'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        <div className="mb-4 flex flex-wrap gap-4">
          {view !== 'board' && (
            <label className="flex flex-col gap-1 text-sm text-text">
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TaskStatusName | '')}
                className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text"
              >
                <option value="">All</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm text-text">
            Assignee
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text"
            >
              <option value="">All</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : view === 'board' ? (
          <div className="mb-8">
            <TaskBoardView tasks={tasks} canEditTask={canEdit} onStatusChange={onStatusChange} />
          </div>
        ) : view === 'calendar' ? (
          <div className="mb-8">
            <TaskCalendarView tasks={tasks} />
          </div>
        ) : tasks.length === 0 ? (
          <p className="mb-8 text-sm text-muted">No tasks match these filters.</p>
        ) : (
          <div className="mb-8 overflow-x-auto rounded-card border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-alt text-muted">
                <tr>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Priority</th>
                  <th className="px-4 py-2">Due</th>
                  <th className="px-4 py-2">Assignee</th>
                  <th className="px-4 py-2">Project</th>
                  {canDelete && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-2 text-text">
                      <Link href={`/tasks/${t.id}`} className="hover:text-accent hover:underline">
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-text">
                      {canEdit(t) ? (
                        <select
                          value={t.status}
                          onChange={(e) => onStatusChange(t, e.target.value as TaskStatusName)}
                          className="rounded border border-border bg-surface px-2 py-1 text-sm text-text"
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        STATUS_LABELS[t.status]
                      )}
                    </td>
                    <td className="px-4 py-2 text-text">{t.priority}</td>
                    <td className="px-4 py-2 text-muted">{formatDueDate(t.dueDate)}</td>
                    <td className="px-4 py-2 text-muted">
                      {t.assignees.length > 0 ? t.assignees.map((a) => a.name).join(', ') : '—'}
                    </td>
                    <td className="px-4 py-2 text-muted">{t.projectName ?? '—'}</td>
                    {canDelete && (
                      <td className="px-4 py-2">
                        <button type="button" onClick={() => onDelete(t.id)} className="text-sm text-red-500">
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="max-w-sm rounded-card border border-border bg-surface p-6">
          <h2 className="mb-4 text-base font-semibold text-text">Add a task</h2>
          <form onSubmit={onAddTask} className="flex flex-col gap-4">
            <FormField label="Title" value={title} onChange={setTitle} />
            <FormField label="Description (optional)" value={description} onChange={setDescription} required={false} />
            <label className="flex flex-col gap-1 text-sm text-text">
              Priority
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
            <FormField label="Due date (optional)" type="date" value={dueDate} onChange={setDueDate} required={false} />
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
            <div className="flex flex-col gap-1 text-sm text-text">
              Assignees (optional)
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
            <button
              type="submit"
              disabled={submitting}
              className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add task'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
