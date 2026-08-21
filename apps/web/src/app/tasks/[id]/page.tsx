'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  createCommentSchema,
  createDependencySchema,
  createReopenRequestSchema,
  createSubtaskSchema,
  createTimeEntrySchema,
  type AttachmentSummary,
  type CommentSummary,
  type DependencySummary,
  type ReopenRequestSummary,
  type SubtaskSummary,
  type TaskActivitySummary,
  type TaskSummary,
  type TimeEntrySummary,
} from '@madre-pulse/shared';
import { AppNav } from '../../../components/app-nav';
import { FormField } from '../../../components/form-field';
import { apiFetch } from '../../../lib/api-client';
import { useRequireAuth } from '../../../lib/use-require-auth';

const STATUS_LABELS: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

type FeedItem =
  | { kind: 'activity'; id: string; createdAt: string; activity: TaskActivitySummary }
  | { kind: 'comment'; id: string; createdAt: string; comment: CommentSummary };

function formatDueDate(iso: string | null): string {
  if (!iso) return 'No due date';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function todayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const { status, role, user } = useRequireAuth();

  const [task, setTask] = useState<TaskSummary | null>(null);
  const [subtasks, setSubtasks] = useState<SubtaskSummary[]>([]);
  const [dependencies, setDependencies] = useState<DependencySummary[]>([]);
  const [allTasks, setAllTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newSubtask, setNewSubtask] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newDependencyId, setNewDependencyId] = useState('');
  const [addingDependency, setAddingDependency] = useState(false);

  const [activities, setActivities] = useState<TaskActivitySummary[]>([]);
  const [comments, setComments] = useState<CommentSummary[]>([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [attachments, setAttachments] = useState<AttachmentSummary[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [timeEntries, setTimeEntries] = useState<TimeEntrySummary[]>([]);
  const [hoursInput, setHoursInput] = useState('');
  const [dateInput, setDateInput] = useState(todayLocalDateString());
  const [noteInput, setNoteInput] = useState('');
  const [loggingTime, setLoggingTime] = useState(false);

  const [reopenRequests, setReopenRequests] = useState<ReopenRequestSummary[]>([]);
  const [reopenReason, setReopenReason] = useState('');
  const [requestingReopen, setRequestingReopen] = useState(false);

  async function loadAll() {
    const [t, s, d, all, act, cmts, atts, entries, reopens] = await Promise.all([
      apiFetch<TaskSummary>(`/tasks/${taskId}`),
      apiFetch<SubtaskSummary[]>(`/tasks/${taskId}/subtasks`),
      apiFetch<DependencySummary[]>(`/tasks/${taskId}/dependencies`),
      apiFetch<TaskSummary[]>('/tasks'),
      apiFetch<TaskActivitySummary[]>(`/tasks/${taskId}/activity`),
      apiFetch<CommentSummary[]>(`/tasks/${taskId}/comments`),
      apiFetch<AttachmentSummary[]>(`/tasks/${taskId}/attachments`),
      apiFetch<TimeEntrySummary[]>(`/tasks/${taskId}/time-entries`),
      apiFetch<ReopenRequestSummary[]>(`/tasks/${taskId}/reopen-requests`),
    ]);
    setTask(t);
    setSubtasks(s);
    setDependencies(d);
    setAllTasks(all);
    setActivities(act);
    setComments(cmts);
    setAttachments(atts);
    setTimeEntries(entries);
    setReopenRequests(reopens);
  }

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    loadAll()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load task'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, taskId]);

  async function onAddSubtask(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createSubtaskSchema.safeParse({ title: newSubtask });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }
    setAddingSubtask(true);
    try {
      const subtask = await apiFetch<SubtaskSummary>(`/tasks/${taskId}/subtasks`, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setSubtasks((prev) => [...prev, subtask]);
      setNewSubtask('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add subtask.');
    } finally {
      setAddingSubtask(false);
    }
  }

  async function onToggleSubtask(subtask: SubtaskSummary) {
    setError(null);
    try {
      const updated = await apiFetch<SubtaskSummary>(`/tasks/${taskId}/subtasks/${subtask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: !subtask.done }),
      });
      setSubtasks((prev) => prev.map((s) => (s.id === subtask.id ? updated : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update subtask.');
    }
  }

  async function onDeleteSubtask(id: string) {
    setError(null);
    try {
      await apiFetch(`/tasks/${taskId}/subtasks/${id}`, { method: 'DELETE' });
      setSubtasks((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete subtask.');
    }
  }

  async function onAddDependency(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createDependencySchema.safeParse({ dependsOnId: newDependencyId });
    if (!parsed.success) {
      setError('Choose a task to depend on.');
      return;
    }
    setAddingDependency(true);
    try {
      const dep = await apiFetch<DependencySummary>(`/tasks/${taskId}/dependencies`, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setDependencies((prev) => [...prev, dep]);
      setNewDependencyId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add dependency.');
    } finally {
      setAddingDependency(false);
    }
  }

  async function onRemoveDependency(id: string) {
    setError(null);
    try {
      await apiFetch(`/tasks/${taskId}/dependencies/${id}`, { method: 'DELETE' });
      setDependencies((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove dependency.');
    }
  }

  async function onPostComment(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createCommentSchema.safeParse({ body: newComment });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Comment cannot be empty.');
      return;
    }
    setPostingComment(true);
    try {
      const comment = await apiFetch<CommentSummary>(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setComments((prev) => [...prev, comment]);
      setNewComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment.');
    } finally {
      setPostingComment(false);
    }
  }

  async function onDeleteComment(id: string) {
    setError(null);
    try {
      await apiFetch(`/tasks/${taskId}/comments/${id}`, { method: 'DELETE' });
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete comment.');
    }
  }

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const attachment = await apiFetch<AttachmentSummary>(`/tasks/${taskId}/attachments`, {
        method: 'POST',
        body: formData,
      });
      setAttachments((prev) => [attachment, ...prev]);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file.');
    } finally {
      setUploading(false);
    }
  }

  async function onDownload(attachmentId: string) {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(`/tasks/${taskId}/attachments/${attachmentId}/download-url`);
      window.open(url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get download link.');
    }
  }

  async function onDeleteAttachment(id: string) {
    setError(null);
    try {
      await apiFetch(`/tasks/${taskId}/attachments/${id}`, { method: 'DELETE' });
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete attachment.');
    }
  }

  async function onLogTime(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const hours = parseFloat(hoursInput);
    if (Number.isNaN(hours) || hours <= 0) {
      setError('Enter a valid number of hours.');
      return;
    }
    const parsed = createTimeEntrySchema.safeParse({
      minutes: Math.round(hours * 60),
      note: noteInput || undefined,
      date: dateInput || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your input.');
      return;
    }
    setLoggingTime(true);
    try {
      const entry = await apiFetch<TimeEntrySummary>(`/tasks/${taskId}/time-entries`, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setTimeEntries((prev) => [entry, ...prev]);
      setHoursInput('');
      setNoteInput('');
      setDateInput(todayLocalDateString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log time.');
    } finally {
      setLoggingTime(false);
    }
  }

  async function onDeleteTimeEntry(id: string) {
    setError(null);
    try {
      await apiFetch(`/tasks/${taskId}/time-entries/${id}`, { method: 'DELETE' });
      setTimeEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete time entry.');
    }
  }

  async function onRequestReopen(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createReopenRequestSchema.safeParse({ reason: reopenReason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'A reason is required.');
      return;
    }
    setRequestingReopen(true);
    try {
      const request = await apiFetch<ReopenRequestSummary>(`/tasks/${taskId}/reopen-requests`, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setReopenRequests((prev) => [request, ...prev]);
      setReopenReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request reopen.');
    } finally {
      setRequestingReopen(false);
    }
  }

  async function onDecideReopen(id: string, approve: boolean) {
    setError(null);
    try {
      const decided = await apiFetch<ReopenRequestSummary>(`/tasks/${taskId}/reopen-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ approve }),
      });
      setReopenRequests((prev) => prev.map((r) => (r.id === id ? decided : r)));
      if (approve) {
        const refreshed = await apiFetch<TaskSummary>(`/tasks/${taskId}`);
        setTask(refreshed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record decision.');
    }
  }

  if (status !== 'authenticated') return null;

  const canEdit = task
    ? role === 'ADMIN' || role === 'MANAGER' || task.assigneeId === user?.id || task.createdById === user?.id
    : false;

  const doneCount = subtasks.filter((s) => s.done).length;
  const dependencyOptions = allTasks.filter(
    (t) => t.id !== taskId && !dependencies.some((d) => d.dependsOnId === t.id),
  );

  const totalMinutes = timeEntries.reduce((sum, e) => sum + e.minutes, 0);
  const hasPendingReopenRequest = reopenRequests.some((r) => r.status === 'PENDING');
  const canReview = role === 'ADMIN' || role === 'MANAGER';

  const feed: FeedItem[] = [
    ...activities.map((a): FeedItem => ({ kind: 'activity', id: a.id, createdAt: a.createdAt, activity: a })),
    ...comments.map((c): FeedItem => ({ kind: 'comment', id: c.id, createdAt: c.createdAt, comment: c })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="mx-auto max-w-3xl p-8">
        <Link href="/tasks" className="mb-4 inline-block text-sm text-accent">
          ← Back to tasks
        </Link>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {loading || !task ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <>
            <div className="mb-6 rounded-card border border-border bg-surface p-6">
              <h1 className="mb-2 text-xl font-bold text-text">{task.title}</h1>
              {task.description && <p className="mb-3 text-sm text-muted">{task.description}</p>}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                <span>
                  Status: <span className="text-text">{STATUS_LABELS[task.status] ?? task.status}</span>
                </span>
                <span>
                  Priority: <span className="text-text">{task.priority}</span>
                </span>
                <span>
                  Due: <span className="text-text">{formatDueDate(task.dueDate)}</span>
                </span>
                <span>
                  Assignee: <span className="text-text">{task.assigneeName ?? 'Unassigned'}</span>
                </span>
                <span>
                  Project: <span className="text-text">{task.projectName ?? 'None'}</span>
                </span>
              </div>
            </div>

            {(task.status === 'DONE' || reopenRequests.length > 0) && (
              <div className="mb-6 rounded-card border border-border bg-surface p-6">
                <h2 className="mb-1 text-base font-semibold text-text">Reopen requests</h2>
                <p className="mb-4 text-sm text-muted">
                  {reopenRequests.length === 0
                    ? 'This task is done. If it needs more work, request that it be reopened.'
                    : 'Requests to reopen this completed task:'}
                </p>
                {reopenRequests.length > 0 && (
                  <ul className="mb-4 flex flex-col gap-2">
                    {reopenRequests.map((r) => (
                      <li key={r.id} className="rounded-card border border-border p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-text">{r.requestedByName}</span>
                          <span
                            className={
                              r.status === 'PENDING'
                                ? 'text-xs font-medium text-amber-600'
                                : r.status === 'APPROVED'
                                  ? 'text-xs font-medium text-green-600'
                                  : 'text-xs font-medium text-red-500'
                            }
                          >
                            {r.status}
                          </span>
                        </div>
                        <p className="mt-1 text-text">{r.reason}</p>
                        {r.status !== 'PENDING' && (
                          <p className="mt-1 text-xs text-muted">
                            {r.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {r.reviewedByName}
                            {r.reviewNote ? `: ${r.reviewNote}` : ''}
                          </p>
                        )}
                        {r.status === 'PENDING' && canReview && (
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => onDecideReopen(r.id, true)}
                              className="rounded-card bg-accent px-3 py-1 text-xs font-medium text-white"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => onDecideReopen(r.id, false)}
                              className="rounded-card border border-border px-3 py-1 text-xs font-medium text-text"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {task.status === 'DONE' && canEdit && !hasPendingReopenRequest && (
                  <form onSubmit={onRequestReopen} className="flex items-end gap-2">
                    <div className="flex-1">
                      <FormField label="Reason to reopen" value={reopenReason} onChange={setReopenReason} />
                    </div>
                    <button
                      type="submit"
                      disabled={requestingReopen}
                      className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {requestingReopen ? 'Requesting…' : 'Request reopen'}
                    </button>
                  </form>
                )}
              </div>
            )}

            <div className="mb-6 rounded-card border border-border bg-surface p-6">
              <h2 className="mb-1 text-base font-semibold text-text">Subtasks</h2>
              <p className="mb-4 text-sm text-muted">
                {subtasks.length === 0 ? 'No subtasks yet.' : `${doneCount} of ${subtasks.length} complete`}
              </p>
              <ul className="mb-4 flex flex-col gap-2">
                {subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={s.done}
                      onChange={() => onToggleSubtask(s)}
                      disabled={!canEdit}
                      className="h-4 w-4"
                    />
                    <span className={`flex-1 text-text ${s.done ? 'text-muted line-through' : ''}`}>{s.title}</span>
                    {canEdit && (
                      <button type="button" onClick={() => onDeleteSubtask(s.id)} className="text-xs text-red-500">
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <form onSubmit={onAddSubtask} className="flex items-end gap-2">
                  <div className="flex-1">
                    <FormField label="New subtask" value={newSubtask} onChange={setNewSubtask} />
                  </div>
                  <button
                    type="submit"
                    disabled={addingSubtask}
                    className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Add
                  </button>
                </form>
              )}
            </div>

            <div className="rounded-card border border-border bg-surface p-6">
              <h2 className="mb-1 text-base font-semibold text-text">Depends on</h2>
              <p className="mb-4 text-sm text-muted">
                {dependencies.length === 0 ? 'This task has no blockers.' : 'This task is blocked until these are done:'}
              </p>
              <ul className="mb-4 flex flex-col gap-2">
                {dependencies.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${d.dependsOnStatus === 'DONE' ? 'bg-green-500' : 'bg-amber-500'}`} />
                    <Link href={`/tasks/${d.dependsOnId}`} className="flex-1 text-text hover:text-accent hover:underline">
                      {d.dependsOnTitle}
                    </Link>
                    <span className="text-xs text-muted">{STATUS_LABELS[d.dependsOnStatus] ?? d.dependsOnStatus}</span>
                    {canEdit && (
                      <button type="button" onClick={() => onRemoveDependency(d.id)} className="text-xs text-red-500">
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && dependencyOptions.length > 0 && (
                <form onSubmit={onAddDependency} className="flex items-end gap-2">
                  <label className="flex flex-1 flex-col gap-1 text-sm text-text">
                    Add a blocker
                    <select
                      value={newDependencyId}
                      onChange={(e) => setNewDependencyId(e.target.value)}
                      className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text"
                    >
                      <option value="">Select a task…</option>
                      {dependencyOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={addingDependency || !newDependencyId}
                    className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Add
                  </button>
                </form>
              )}
            </div>

            <div className="mb-6 mt-6 rounded-card border border-border bg-surface p-6">
              <h2 className="mb-4 text-base font-semibold text-text">Attachments</h2>
              {attachments.length === 0 ? (
                <p className="mb-4 text-sm text-muted">No files attached yet.</p>
              ) : (
                <ul className="mb-4 flex flex-col gap-2">
                  {attachments.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm">
                      <button
                        type="button"
                        onClick={() => onDownload(a.id)}
                        className="flex-1 truncate text-left text-text hover:text-accent hover:underline"
                      >
                        {a.fileName}
                      </button>
                      <span className="shrink-0 text-xs text-muted">{formatBytes(a.sizeBytes)}</span>
                      <span className="shrink-0 text-xs text-muted">{a.uploadedByName}</span>
                      {(role === 'ADMIN' || role === 'MANAGER' || a.uploadedById === user?.id) && (
                        <button
                          type="button"
                          onClick={() => onDeleteAttachment(a.id)}
                          className="shrink-0 text-xs text-red-500"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={onUpload} className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="flex-1 text-sm text-text"
                />
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </form>
            </div>

            <div className="mb-6 rounded-card border border-border bg-surface p-6">
              <h2 className="mb-1 text-base font-semibold text-text">Time tracked</h2>
              <p className="mb-4 text-sm text-muted">
                {timeEntries.length === 0 ? 'No time logged yet.' : `Total: ${formatMinutes(totalMinutes)}`}
              </p>
              {timeEntries.length > 0 && (
                <ul className="mb-4 flex flex-col gap-2">
                  {timeEntries.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-sm">
                      <span className="w-16 shrink-0 text-text">{formatMinutes(e.minutes)}</span>
                      <span className="w-28 shrink-0 text-xs text-muted">{formatDueDate(e.date)}</span>
                      <span className="w-28 shrink-0 truncate text-xs text-muted">{e.userName}</span>
                      <span className="flex-1 truncate text-xs text-muted">{e.note ?? ''}</span>
                      {(role === 'ADMIN' || role === 'MANAGER' || e.userId === user?.id) && (
                        <button
                          type="button"
                          onClick={() => onDeleteTimeEntry(e.id)}
                          className="shrink-0 text-xs text-red-500"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={onLogTime} className="flex flex-wrap items-end gap-2">
                <label className="flex w-24 flex-col gap-1 text-sm text-text">
                  Hours
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={hoursInput}
                    onChange={(e) => setHoursInput(e.target.value)}
                    required
                    className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text outline-none focus:border-accent"
                  />
                </label>
                <FormField label="Date" type="date" value={dateInput} onChange={setDateInput} />
                <div className="flex-1">
                  <FormField label="Note (optional)" value={noteInput} onChange={setNoteInput} required={false} />
                </div>
                <button
                  type="submit"
                  disabled={loggingTime}
                  className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {loggingTime ? 'Logging…' : 'Log time'}
                </button>
              </form>
            </div>

            <div className="rounded-card border border-border bg-surface p-6">
              <h2 className="mb-4 text-base font-semibold text-text">Activity</h2>
              <div className="mb-4 flex flex-col gap-3">
                {feed.length === 0 && <p className="text-sm text-muted">No activity yet.</p>}
                {feed.map((item) =>
                  item.kind === 'activity' ? (
                    <p key={item.id} className="text-xs text-muted">
                      <span className="text-text">{item.activity.actorName}</span> {item.activity.message} ·{' '}
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  ) : (
                    <div key={item.id} className="flex gap-2">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: item.comment.authorAvatarColor }}
                      >
                        {item.comment.authorInitials}
                      </div>
                      <div className="flex-1 rounded-card bg-surface-alt p-3 text-sm">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-medium text-text">{item.comment.authorName}</span>
                          <span className="text-xs text-muted">{new Date(item.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-text">{item.comment.body}</p>
                        {(role === 'ADMIN' || role === 'MANAGER' || item.comment.authorId === user?.id) && (
                          <button
                            type="button"
                            onClick={() => onDeleteComment(item.comment.id)}
                            className="mt-1 text-xs text-red-500"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
              <form onSubmit={onPostComment} className="flex items-end gap-2">
                <div className="flex-1">
                  <FormField label="Add a comment" value={newComment} onChange={setNewComment} />
                </div>
                <button
                  type="submit"
                  disabled={postingComment}
                  className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Post
                </button>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
