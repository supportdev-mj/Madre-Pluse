'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  createBlockerReportSchema,
  createDependencySchema,
  createReopenRequestSchema,
  createSubtaskSchema,
  type AssignmentStatusName,
  type BlockerReportSummary,
  type DependencySummary,
  type MemberSummary,
  type ReopenRequestSummary,
  type SubtaskSummary,
  type TaskSummary,
  type TimeEntrySummary,
  type VerificationDecision,
} from '@madre-pulse/shared';
import { AppNav } from '../../../components/app-nav';
import { FormField } from '../../../components/form-field';
import { apiFetch } from '../../../lib/api-client';
import { computeAssignableMembers } from '../../../lib/assignable-members';
import { useRequireAuth } from '../../../lib/use-require-auth';
import { TaskChatPanel } from './task-chat-panel';

const STATUS_LABELS: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  TO_VERIFY: 'To Verify',
  FAILED: 'Failed',
  DONE: 'Completed',
};

// A "Completed" personal status only ever means the last timer session ended — it says nothing
// about whether the assignee is idle right now, so on its own it's never shown; only an active
// IN_PROGRESS session is distinguished from idle. Once the whole task is verified Done, everyone's
// personal status simply reads "Completed" regardless of their own timer state.
function personalStatusLabel(s: AssignmentStatusName, taskStatus: string): string {
  if (taskStatus === 'DONE') return 'Completed';
  return s === 'IN_PROGRESS' ? 'In Progress (started)' : 'Not started';
}

function personalStatusStyle(s: AssignmentStatusName, taskStatus: string): string {
  if (taskStatus === 'DONE') return 'text-green-600';
  return s === 'IN_PROGRESS' ? 'text-amber-600' : 'text-muted';
}

function formatDueDate(iso: string | null): string {
  if (!iso) return 'No due date';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatElapsed(startIso: string, nowMs: number): string {
  const totalSeconds = Math.max(0, Math.floor((nowMs - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const { status, role, user } = useRequireAuth();

  const [task, setTask] = useState<TaskSummary | null>(null);
  const [subtasks, setSubtasks] = useState<SubtaskSummary[]>([]);
  const [dependencies, setDependencies] = useState<DependencySummary[]>([]);
  const [allTasks, setAllTasks] = useState<TaskSummary[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [updatingAssignees, setUpdatingAssignees] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newSubtask, setNewSubtask] = useState('');
  const [newSubtaskAssigneeId, setNewSubtaskAssigneeId] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newDependencyId, setNewDependencyId] = useState('');
  const [addingDependency, setAddingDependency] = useState(false);

  const [timeEntries, setTimeEntries] = useState<TimeEntrySummary[]>([]);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const [reviewNote, setReviewNote] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [reopenRequests, setReopenRequests] = useState<ReopenRequestSummary[]>([]);
  const [reopenReason, setReopenReason] = useState('');
  const [requestingReopen, setRequestingReopen] = useState(false);

  const [blockerReports, setBlockerReports] = useState<BlockerReportSummary[]>([]);
  const [blockerReason, setBlockerReason] = useState('');
  const [reportingBlocker, setReportingBlocker] = useState(false);

  async function loadAll() {
    const [t, s, d, all, entries, reopens, mems, blockers] = await Promise.all([
      apiFetch<TaskSummary>(`/tasks/${taskId}`),
      apiFetch<SubtaskSummary[]>(`/tasks/${taskId}/subtasks`),
      apiFetch<DependencySummary[]>(`/tasks/${taskId}/dependencies`),
      apiFetch<TaskSummary[]>('/tasks'),
      apiFetch<TimeEntrySummary[]>(`/tasks/${taskId}/time-entries`),
      apiFetch<ReopenRequestSummary[]>(`/tasks/${taskId}/reopen-requests`),
      apiFetch<MemberSummary[]>('/members'),
      apiFetch<BlockerReportSummary[]>(`/tasks/${taskId}/blocker-reports`),
    ]);
    setTask(t);
    setSubtasks(s);
    setDependencies(d);
    setAllTasks(all);
    setTimeEntries(entries);
    setReopenRequests(reopens);
    setMembers(mems);
    setBlockerReports(blockers);
  }

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    loadAll()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load task'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, taskId]);

  const myAssignment = task?.assignees.find((a) => a.userId === user?.id) ?? null;

  useEffect(() => {
    if (!myAssignment || myAssignment.personalStatus !== 'IN_PROGRESS') return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [myAssignment?.personalStatus, myAssignment?.activeStartedAt]);

  async function onAddSubtask(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createSubtaskSchema.safeParse({
      title: newSubtask,
      assigneeId: newSubtaskAssigneeId || undefined,
    });
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
      setNewSubtaskAssigneeId('');
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

  async function onReassignSubtask(subtask: SubtaskSummary, assigneeId: string) {
    setError(null);
    try {
      const updated = await apiFetch<SubtaskSummary>(`/tasks/${taskId}/subtasks/${subtask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeId: assigneeId || null }),
      });
      setSubtasks((prev) => prev.map((s) => (s.id === subtask.id ? updated : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reassign subtask.');
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

  async function onStartTracking() {
    setError(null);
    setTrackingBusy(true);
    try {
      const updated = await apiFetch<TaskSummary>(`/tasks/${taskId}/start`, { method: 'POST' });
      setTask(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start tracking.');
    } finally {
      setTrackingBusy(false);
    }
  }

  /** Stops the current tracking session (logs the elapsed time) — this is just the timer's
   * stop/pause action, distinct from onMarkTaskComplete below which finishes the whole task. */
  async function onStopTracking() {
    setError(null);
    setTrackingBusy(true);
    try {
      const result = await apiFetch<{ task: TaskSummary; timeEntry: TimeEntrySummary }>(`/tasks/${taskId}/complete`, {
        method: 'POST',
      });
      setTask(result.task);
      setTimeEntries((prev) => [result.timeEntry, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop tracking.');
    } finally {
      setTrackingBusy(false);
    }
  }

  /** Sends the task to the assignee's immediate manager for approval — this is the only way a
   * task can move toward Done now; a direct PATCH to DONE is rejected by the API. */
  async function onSendForVerification() {
    if (!window.confirm('Send this task to your manager for verification?')) return;
    setError(null);
    setTrackingBusy(true);
    try {
      const updated = await apiFetch<TaskSummary>(`/tasks/${taskId}/submit-for-verification`, { method: 'POST' });
      setTask(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send task for verification.');
    } finally {
      setTrackingBusy(false);
    }
  }

  /** Admin/manager-only: a Failed task can't be reworked by the assignee on their own — someone
   * with edit rights has to deliberately take it back to In Progress first. */
  async function onTakeBackFailedTask() {
    setError(null);
    setTrackingBusy(true);
    try {
      const updated = await apiFetch<TaskSummary>(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      });
      setTask(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen this task.');
    } finally {
      setTrackingBusy(false);
    }
  }

  async function onDecideVerification(decision: VerificationDecision) {
    const confirmMessage =
      decision === 'APPROVE'
        ? 'Approve this task as verified and complete?'
        : decision === 'REJECT'
          ? 'Reject this task? It will be marked Failed until the assignee reworks and resubmits it.'
          : null;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    setVerifying(true);
    try {
      const updated = await apiFetch<TaskSummary>(`/tasks/${taskId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, reviewNote: reviewNote.trim() || undefined }),
      });
      setTask(updated);
      setReviewNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record verification decision.');
    } finally {
      setVerifying(false);
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

  async function onReportBlocker(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createBlockerReportSchema.safeParse({ reason: blockerReason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'A reason is required.');
      return;
    }
    setReportingBlocker(true);
    try {
      const report = await apiFetch<BlockerReportSummary>(`/tasks/${taskId}/blocker-reports`, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setBlockerReports((prev) => [report, ...prev]);
      setBlockerReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to report blocker.');
    } finally {
      setReportingBlocker(false);
    }
  }

  async function onResolveBlocker(id: string) {
    setError(null);
    try {
      const resolved = await apiFetch<BlockerReportSummary>(`/tasks/${taskId}/blocker-reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      setBlockerReports((prev) => prev.map((r) => (r.id === id ? resolved : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve blocker.');
    }
  }

  async function onToggleAssignee(userId: string) {
    if (!task) return;
    setError(null);
    const nextIds = task.assignees.some((a) => a.userId === userId)
      ? task.assignees.filter((a) => a.userId !== userId).map((a) => a.userId)
      : [...task.assignees.map((a) => a.userId), userId];
    setUpdatingAssignees(true);
    try {
      const updated = await apiFetch<TaskSummary>(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigneeIds: nextIds }),
      });
      setTask(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assignees.');
    } finally {
      setUpdatingAssignees(false);
    }
  }

  if (status !== 'authenticated') return null;

  // Subtasks, dependencies, blocker reports, and reopen requests are collaborative — the creator
  // or an assignee participates the same as an admin/manager.
  const canCollaborate = task
    ? role === 'ADMIN' || role === 'MANAGER' || task.assignees.some((a) => a.userId === user?.id) || task.createdById === user?.id
    : false;
  // Editing the task's own fields (reassigning, taking a Failed task back to rework) is an
  // admin/manager action only — the backend enforces the precise "manager of an assignee" check;
  // this just decides whether to show the control, so a manager of an unrelated task sees it
  // hidden here but would also be rejected server-side if they somehow tried anyway.
  const canEditFields = role === 'ADMIN' || role === 'MANAGER';

  const doneCount = subtasks.filter((s) => s.done).length;
  const dependencyOptions = allTasks.filter(
    (t) => t.id !== taskId && !dependencies.some((d) => d.dependsOnId === t.id),
  );

  const totalMinutes = timeEntries.reduce((sum, e) => sum + e.minutes, 0);
  const hasPendingReopenRequest = reopenRequests.some((r) => r.status === 'PENDING');
  const canReview = role === 'ADMIN' || role === 'MANAGER';

  return (
    <div className="min-h-screen sm:pl-60">
      <AppNav />
      <main className="mx-auto max-w-7xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8">
        <Link href="/tasks" className="mb-4 inline-block text-sm text-accent">
          ← Back to tasks
        </Link>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {loading || !task ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
            <div className="order-1 lg:col-start-1">
              <TaskChatPanel taskId={taskId} currentUserId={user?.id} role={role} />
            </div>

            <div className="order-2 flex flex-col gap-6 lg:col-start-2">
              <div className="rounded-card border border-border bg-surface p-6">
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
                    Project: <span className="text-text">{task.projectName ?? 'None'}</span>
                  </span>
                </div>

                <div className="mt-4">
                  <p className="mb-1.5 text-sm text-muted">Assignees</p>
                  {canEditFields ? (
                    <div className="flex flex-col gap-1.5 rounded-card border border-border bg-surface-alt px-3 py-2">
                      {computeAssignableMembers(members, role, user?.id, task.assignees.map((a) => a.userId))
                        .map((m) => (
                          <label key={m.userId} className="flex items-center gap-2 text-sm text-text">
                            <input
                              type="checkbox"
                              checked={task.assignees.some((a) => a.userId === m.userId)}
                              disabled={updatingAssignees}
                              onChange={() => onToggleAssignee(m.userId)}
                            />
                            {m.name}
                          </label>
                        ))}
                    </div>
                  ) : task.assignees.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {task.assignees.map((a) => (
                        <span key={a.userId} className="flex items-center gap-1.5 rounded-full bg-surface-alt py-1 pl-1 pr-2.5 text-xs text-text">
                          <span
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                            style={{ backgroundColor: a.avatarColor }}
                          >
                            {a.initials}
                          </span>
                          {a.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">Unassigned</p>
                  )}
                </div>
              </div>

              <div className="rounded-card border border-border bg-surface p-6">
                <h2 className="mb-4 text-base font-semibold text-text">My Status</h2>
                {!myAssignment ? (
                  <p className="mb-4 text-sm text-muted">You&apos;re not assigned to this task.</p>
                ) : (
                  <>
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs text-muted">Status</p>
                        <p className={`text-sm font-medium ${personalStatusStyle(myAssignment.personalStatus, task.status)}`}>
                          {personalStatusLabel(myAssignment.personalStatus, task.status)}
                        </p>
                        {myAssignment.personalStatus === 'IN_PROGRESS' && myAssignment.activeStartedAt && (
                          <p className="mt-1 font-mono text-lg text-text">
                            {formatElapsed(myAssignment.activeStartedAt, nowTick)}
                          </p>
                        )}
                      </div>
                      {task.status === 'DONE' && task.verifiedByName ? (
                        <div>
                          <p className="text-xs text-muted">Verified by</p>
                          <p className="text-sm font-medium text-accent">{task.verifiedByName}</p>
                        </div>
                      ) : (
                        task.status !== 'TO_VERIFY' && task.status !== 'DONE' && task.status !== 'FAILED' && (
                          <button
                            type="button"
                            onClick={myAssignment.personalStatus === 'IN_PROGRESS' ? onStopTracking : onStartTracking}
                            disabled={trackingBusy}
                            className={`rounded-card px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                              myAssignment.personalStatus === 'IN_PROGRESS' ? 'bg-red-500' : 'bg-accent'
                            }`}
                          >
                            {myAssignment.personalStatus === 'IN_PROGRESS' ? 'Stop' : 'Start'}
                          </button>
                        )
                      )}
                    </div>

                    {task.assignees.length > 1 && (
                      <div className="border-t border-border pt-3">
                        <p className="mb-2 text-xs font-medium text-muted">All assignees</p>
                        <ul className="flex flex-col gap-1.5">
                          {task.assignees.map((a) => (
                            <li key={a.userId} className="flex items-center justify-between text-sm">
                              <span className="text-text">{a.name}</span>
                              <span className={personalStatusStyle(a.personalStatus, task.status)}>
                                {personalStatusLabel(a.personalStatus, task.status)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {task.status === 'DONE' ? (
                  <p className="text-sm font-medium text-green-600">✓ This task is verified and complete.</p>
                ) : task.status === 'TO_VERIFY' ? (
                  task.canVerify ? (
                    <div className="flex flex-col gap-2 border-t border-border pt-3">
                      <p className="text-sm font-medium text-amber-600">Awaiting your verification</p>
                      <FormField label="Review note (optional)" value={reviewNote} onChange={setReviewNote} />
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => onDecideVerification('APPROVE')}
                          disabled={verifying}
                          className="flex-1 rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          Approve &amp; complete
                        </button>
                        <button
                          type="button"
                          onClick={() => onDecideVerification('SEND_BACK')}
                          disabled={verifying}
                          className="flex-1 rounded-card border border-border px-4 py-2 text-sm font-medium text-text disabled:opacity-50"
                        >
                          Send back
                        </button>
                        <button
                          type="button"
                          onClick={() => onDecideVerification('REJECT')}
                          disabled={verifying}
                          className="flex-1 rounded-card border border-red-300 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-amber-600">
                      Sent for verification — awaiting your manager&apos;s approval.
                    </p>
                  )
                ) : task.status === 'FAILED' ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-red-500">
                      ✗ Verification failed. {canEditFields ? 'Take it back to let the assignee rework it.' : 'Ask your manager or an admin to reopen it before resuming work.'}
                    </p>
                    {canEditFields && (
                      <button
                        type="button"
                        onClick={onTakeBackFailedTask}
                        disabled={trackingBusy}
                        className="w-full rounded-card border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-alt disabled:opacity-50"
                      >
                        Take back to rework
                      </button>
                    )}
                  </div>
                ) : (
                  myAssignment && (
                    <button
                      type="button"
                      onClick={onSendForVerification}
                      disabled={trackingBusy}
                      className="w-full rounded-card border border-green-600 px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50 disabled:opacity-50"
                    >
                      Send for verification
                    </button>
                  )
                )}
              </div>

              <div className="rounded-card border border-border bg-surface p-6">
                <h2 className="mb-1 text-base font-semibold text-text">Time tracked</h2>
                <p className="mb-4 text-sm text-muted">
                  {timeEntries.length === 0 ? 'No time logged yet.' : `Sum of efforts: ${formatMinutes(totalMinutes)}`}
                </p>
                {timeEntries.length > 0 && (
                  <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                    {timeEntries.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-sm">
                        <span className="w-16 shrink-0 font-medium text-text">{formatMinutes(e.minutes)}</span>
                        <span className="w-28 shrink-0 truncate text-xs text-muted">{e.userName}</span>
                        <span className="flex-1 truncate text-xs text-muted">
                          {e.startedAt && e.endedAt
                            ? `${formatDateTime(e.startedAt)} → ${formatDateTime(e.endedAt)}`
                            : formatDueDate(e.date)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(task.status === 'DONE' || reopenRequests.length > 0) && (
                <div className="rounded-card border border-border bg-surface p-6">
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
                  {task.status === 'DONE' && canCollaborate && !hasPendingReopenRequest && (
                    <form onSubmit={onRequestReopen} className="flex flex-col gap-2 sm:flex-row sm:items-end">
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

              <div className="rounded-card border border-border bg-surface p-6">
                <h2 className="mb-1 text-base font-semibold text-text">Blockers</h2>
                <p className="mb-4 text-sm text-muted">
                  {blockerReports.length === 0
                    ? 'Nothing reported. If something is blocking this task, report it so admins/managers can help.'
                    : 'Reported blockers on this task:'}
                </p>
                {blockerReports.length > 0 && (
                  <ul className="mb-4 flex flex-col gap-2">
                    {blockerReports.map((b) => (
                      <li key={b.id} className="rounded-card border border-border p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-text">{b.reportedByName}</span>
                          <span
                            className={
                              b.status === 'OPEN' ? 'text-xs font-medium text-red-500' : 'text-xs font-medium text-green-600'
                            }
                          >
                            {b.status}
                          </span>
                        </div>
                        <p className="mt-1 text-text">{b.reason}</p>
                        {b.status === 'RESOLVED' && (
                          <p className="mt-1 text-xs text-muted">
                            Resolved by {b.resolvedByName}
                            {b.resolutionNote ? `: ${b.resolutionNote}` : ''}
                          </p>
                        )}
                        {b.status === 'OPEN' && canReview && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => onResolveBlocker(b.id)}
                              className="rounded-card bg-accent px-3 py-1 text-xs font-medium text-white"
                            >
                              Resolve
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canCollaborate && (
                  <form onSubmit={onReportBlocker} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <FormField label="What's blocking this?" value={blockerReason} onChange={setBlockerReason} />
                    </div>
                    <button
                      type="submit"
                      disabled={reportingBlocker}
                      className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {reportingBlocker ? 'Reporting…' : 'Report blocker'}
                    </button>
                  </form>
                )}
              </div>

              <div className="rounded-card border border-border bg-surface p-6">
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
                        disabled={!canCollaborate}
                        className="h-4 w-4"
                      />
                      <span className={`flex-1 text-text ${s.done ? 'text-muted line-through' : ''}`}>{s.title}</span>
                      {canCollaborate ? (
                        <select
                          value={s.assignee?.userId ?? ''}
                          onChange={(e) => onReassignSubtask(s, e.target.value)}
                          className="rounded border border-border bg-surface-alt px-2 py-1 text-xs text-text"
                        >
                          <option value="">Unassigned</option>
                          {task.assignees.map((a) => (
                            <option key={a.userId} value={a.userId}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      ) : s.assignee ? (
                        <span
                          title={s.assignee.name}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                          style={{ backgroundColor: s.assignee.avatarColor }}
                        >
                          {s.assignee.initials}
                        </span>
                      ) : (
                        <span className="text-xs text-faint">Unassigned</span>
                      )}
                      {canCollaborate && (
                        <button type="button" onClick={() => onDeleteSubtask(s.id)} className="text-xs text-red-500">
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {canCollaborate && (
                  <form onSubmit={onAddSubtask} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <FormField label="New subtask" value={newSubtask} onChange={setNewSubtask} />
                    </div>
                    <label className="flex flex-col gap-1 text-sm text-text">
                      Owner
                      <select
                        value={newSubtaskAssigneeId}
                        onChange={(e) => setNewSubtaskAssigneeId(e.target.value)}
                        className="rounded-card border border-border bg-surface-alt px-3 py-2 text-sm text-text"
                      >
                        <option value="">Unassigned</option>
                        {task.assignees.map((a) => (
                          <option key={a.userId} value={a.userId}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
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
                      {canCollaborate && (
                        <button type="button" onClick={() => onRemoveDependency(d.id)} className="text-xs text-red-500">
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {canCollaborate && dependencyOptions.length > 0 && (
                  <form onSubmit={onAddDependency} className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
