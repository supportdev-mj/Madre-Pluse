'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  type ClientSummary,
  type CreateTaskInput,
  type MemberSummary,
  type ProjectSummary,
  type TaskStatusName,
  type TaskSummary,
} from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { apiFetch } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';
import { AddTaskModal } from './add-task-modal';
import { TaskBoardView } from './task-board-view';
import { TaskCalendarView } from './task-calendar-view';

type TaskView = 'list' | 'board' | 'calendar';

const STATUS_LABELS: Record<TaskStatusName, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  TO_VERIFY: 'To Verify',
  FAILED: 'Failed',
  DONE: 'Completed',
};

// The top-row slicer tabs. TO_VERIFY covers two viewpoints on the same status: "Under
// Verification" is what I (as an assignee) sent in and am waiting on; "To Verify" is what's
// waiting on ME to decide (as a manager/admin) — distinguished client-side via TaskSummary.canVerify.
type TaskTab = 'ALL' | 'TODO' | 'IN_PROGRESS' | 'UNDER_VERIFICATION' | 'TO_VERIFY' | 'DONE' | 'FAILED';

const TABS: { id: TaskTab; label: string; activeClass: string; idleClass: string }[] = [
  // A fixed slate rather than bg-text/text-white — bg-text tracks the theme (dark in light mode,
  // light in dark mode), which combined with white text was fine in light mode but nearly
  // unreadable in dark mode (light pill, near-white text).
  { id: 'ALL', label: 'All', activeClass: 'bg-slate-700 text-white', idleClass: 'text-muted hover:bg-surface-alt hover:text-text' },
  { id: 'TODO', label: 'To Do', activeClass: 'bg-slate-500 text-white', idleClass: 'text-slate-500 hover:bg-surface-alt' },
  { id: 'IN_PROGRESS', label: 'In Progress', activeClass: 'bg-sky-500 text-white', idleClass: 'text-sky-600 hover:bg-surface-alt' },
  {
    id: 'UNDER_VERIFICATION',
    label: 'Under Verification',
    activeClass: 'bg-amber-500 text-white',
    idleClass: 'text-amber-600 hover:bg-surface-alt',
  },
  { id: 'TO_VERIFY', label: 'To Verify', activeClass: 'bg-amber-600 text-white', idleClass: 'text-amber-700 hover:bg-surface-alt' },
  { id: 'DONE', label: 'Completed', activeClass: 'bg-green-600 text-white', idleClass: 'text-green-600 hover:bg-surface-alt' },
  { id: 'FAILED', label: 'Failed', activeClass: 'bg-red-500 text-white', idleClass: 'text-red-500 hover:bg-surface-alt' },
];

/** Every tab is just a client-side filter over the one already-fetched, visibility-scoped task
 * list — this is also what powers the per-tab counts, since counting is just filtering + length. */
function filterByTab(allTasks: TaskSummary[], tab: TaskTab, currentUserId: string | undefined): TaskSummary[] {
  switch (tab) {
    case 'ALL':
      return allTasks;
    case 'UNDER_VERIFICATION':
      return allTasks.filter((t) => t.status === 'TO_VERIFY' && t.assignees.some((a) => a.userId === currentUserId));
    case 'TO_VERIFY':
      return allTasks.filter((t) => t.status === 'TO_VERIFY' && t.canVerify);
    default:
      return allTasks.filter((t) => t.status === tab);
  }
}

function formatDueDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function TasksPage() {
  const { status, role, user } = useRequireAuth();
  // The full, visibility-scoped task list (only ever narrowed server-side by the Assignee filter)
  // — every tab, and every tab's count, is just a client-side filter over this one list, so
  // switching tabs no longer needs a round trip and every count stays in sync automatically.
  const [allTasks, setAllTasks] = useState<TaskSummary[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<TaskView>('list');
  const [activeTab, setActiveTab] = useState<TaskTab>('IN_PROGRESS');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);

  async function loadTasks() {
    const params = new URLSearchParams();
    if (assigneeFilter) params.set('assigneeId', assigneeFilter);
    const qs = params.toString();
    const data = await apiFetch<TaskSummary[]>(`/tasks${qs ? `?${qs}` : ''}`);
    setAllTasks(data);
  }

  useEffect(() => {
    if (status !== 'authenticated') return;
    Promise.all([apiFetch<MemberSummary[]>('/members'), apiFetch<ProjectSummary[]>('/projects'), apiFetch<ClientSummary[]>('/clients')])
      .then(([m, p, c]) => {
        setMembers(m);
        setProjects(p);
        setClients(c);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load tasks'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Also covers the initial load — this fires on mount with the default assignee filter too.
  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    loadTasks()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load tasks'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, assigneeFilter]);

  async function onAddTask(input: CreateTaskInput) {
    const task = await apiFetch<TaskSummary>('/tasks', { method: 'POST', body: JSON.stringify(input) });
    setAllTasks((prev) => [task, ...prev]);
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
      setAllTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task.');
    }
  }

  if (status !== 'authenticated') return null;

  // Only an admin can delete a task once it's created.
  const canDelete = role === 'ADMIN';
  // Board groups every status into its own column already, so it always shows everything.
  const tasks = view === 'board' ? allTasks : filterByTab(allTasks, activeTab, user?.id);
  const tabCounts = Object.fromEntries(TABS.map((tab) => [tab.id, filterByTab(allTasks, tab.id, user?.id).length])) as Record<
    TaskTab,
    number
  >;

  return (
    <div className="min-h-screen sm:pl-60">
      <AppNav />
      <main className="mx-auto max-w-7xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-text">Tasks</h1>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-card bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Task
          </button>
        </div>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        {/* The board view already groups tasks into columns by status, so the tabs are redundant
            there — instead of hiding the row (leaving blank space) or unmounting it (causing the
            toolbar below to jump), every tab but All smoothly collapses to zero width and All
            grows to fill the bar, then reverses just as smoothly switching back.
            CSS Grid with `fr` tracks, not flexbox — flex-grow/max-width transitions both turned
            out to animate asymmetrically (smooth one direction, janky the other), because the
            browser has to re-run flexbox's iterative grow/shrink resolution every frame. Grid
            tracks are just interpolated length values, so both directions look identical. */}
        <div
          className="mb-4 grid items-stretch gap-1 rounded-card border border-border bg-surface p-1.5 text-sm transition-[grid-template-columns] duration-300 ease-out"
          style={{ gridTemplateColumns: TABS.map((t) => (view === 'board' && t.id !== 'ALL' ? '0fr' : '1fr')).join(' ') }}
        >
          {TABS.map((tab) => {
            const collapsed = view === 'board' && tab.id !== 'ALL';
            const isHighlighted = view === 'board' ? tab.id === 'ALL' : activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                disabled={collapsed}
                className={`overflow-hidden truncate rounded-card py-1.5 font-medium transition-[opacity,padding] duration-300 ease-out ${
                  collapsed ? 'px-0 opacity-0' : 'px-2 opacity-100'
                } ${isHighlighted ? tab.activeClass : tab.idleClass}`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs font-normal ${isHighlighted ? 'text-white/80' : 'opacity-60'}`}>
                  {tabCounts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
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

        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : view === 'board' ? (
          <div className="mb-8">
            <TaskBoardView tasks={tasks} />
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
                  <th className="px-4 py-2">Client</th>
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
                    <td className="px-4 py-2 text-text">{STATUS_LABELS[t.status]}</td>
                    <td className="px-4 py-2 text-text">{t.priority}</td>
                    <td className="px-4 py-2 text-muted">{formatDueDate(t.dueDate)}</td>
                    <td className="px-4 py-2 text-muted">
                      {t.assignees.length > 0 ? t.assignees.map((a) => a.name).join(', ') : '—'}
                    </td>
                    <td className="px-4 py-2 text-muted">{t.projectName ?? '—'}</td>
                    <td className="px-4 py-2 text-muted">{t.clientName ?? '—'}</td>
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

        {showAddModal && (
          <AddTaskModal
            members={members}
            role={role}
            currentUserId={user?.id}
            projects={projects}
            clients={clients}
            onClose={() => setShowAddModal(false)}
            onSubmit={onAddTask}
          />
        )}
      </main>
    </div>
  );
}
