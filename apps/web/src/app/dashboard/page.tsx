'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DashboardActivityItem, DashboardMemberWorkload, DashboardSummary, TaskPriorityName, TaskStatusName } from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { useRequireAuth } from '../../lib/use-require-auth';

const STATUS_ORDER = ['TODO', 'IN_PROGRESS', 'TO_VERIFY', 'FAILED', 'DONE'] as const;
const STATUS_LABELS: Record<(typeof STATUS_ORDER)[number], string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  TO_VERIFY: 'To Verify',
  FAILED: 'Failed',
  DONE: 'Done',
};
const STATUS_COLORS: Record<(typeof STATUS_ORDER)[number], string> = {
  TODO: '#93A6BC',
  IN_PROGRESS: '#0EA5E9',
  TO_VERIFY: '#F59E0B',
  FAILED: '#EF4444',
  DONE: '#22C55E',
};

const PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const;
const PRIORITY_LABELS: Record<TaskPriorityName, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};
const PRIORITY_COLORS: Record<TaskPriorityName, string> = {
  LOW: '#93A6BC',
  MEDIUM: '#0EA5E9',
  HIGH: '#F59E0B',
  URGENT: '#EF4444',
};

const MEMBER_COLORS = ['#0EA5E9', '#7C3AED', '#DB2777', '#D97706', '#059669', '#2563EB', '#DC2626', '#0D9488'];

const HERO_GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(14,165,233,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,.08) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % MEMBER_COLORS.length;
  return MEMBER_COLORS[hash];
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function Icon({ path, className = 'h-4 w-4' }: { path: string; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

const ICON_PATHS = {
  tasks: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  overdue:
    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  trending: 'M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  plus: 'M12 4.5v15m7.5-7.5h-15',
};

function Metric({ label, value, sub, iconPath, tone }: { label: string; value: string | number; sub: string; iconPath: string; tone: string }) {
  return (
    <div className="min-w-0 rounded-card border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${tone}22` }}>
          <Icon path={iconPath} className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-text">{value}</p>
      <p className="mt-0.5 text-xs text-faint">{sub}</p>
    </div>
  );
}

function StatusBarChart({ statusCounts }: { statusCounts: Record<TaskStatusName, number> }) {
  const max = Math.max(...STATUS_ORDER.map((s) => statusCounts[s]), 1);
  return (
    <div className="flex h-44 items-end gap-4 px-1">
      {STATUS_ORDER.map((s) => (
        <div key={s} className="flex flex-1 flex-col items-center gap-2">
          <span className="font-mono text-xs text-faint">{statusCounts[s]}</span>
          <div
            className="w-full max-w-12 rounded-t-md transition-all"
            style={{ height: `${(statusCounts[s] / max) * 100}%`, minHeight: 4, backgroundColor: STATUS_COLORS[s] }}
          />
          <span className="text-xs text-muted">{STATUS_LABELS[s]}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data, size = 128, strokeWidth = 18 }: { data: { label: string; value: number; color: string }[]; size?: number; strokeWidth?: number }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {total === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={strokeWidth} />
        ) : (
          data.map((d) => {
            if (d.value === 0) return null;
            const frac = d.value / total;
            const dash = frac * circumference;
            const el = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })
        )}
      </g>
    </svg>
  );
}

function WorkloadBars({ members }: { members: DashboardMemberWorkload[] }) {
  const max = Math.max(...members.map((m) => m.openCount), 1);
  if (members.length === 0) return <p className="text-sm text-muted">No active members.</p>;
  return (
    <div className="flex flex-col gap-3">
      {members.map((m) => (
        <div key={m.userId} className="flex items-center gap-3">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ backgroundColor: colorFor(m.userId) }}
          >
            {initialsOf(m.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="truncate font-medium text-text">{m.name}</span>
              <span className="shrink-0 text-faint">
                {m.openCount} open{m.overdueCount > 0 ? ` · ${m.overdueCount} overdue` : ''} · {m.doneCount} done
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
              <div className="h-full rounded-full" style={{ width: `${(m.openCount / max) * 100}%`, backgroundColor: colorFor(m.userId) }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityFeed({ items }: { items: DashboardActivityItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">No activity yet.</p>;
  return (
    <div className="flex flex-col">
      {items.map((a, i) => (
        <div key={a.id} className={`flex gap-2.5 py-2 ${i > 0 ? 'border-t border-border' : ''}`}>
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <p className="text-sm leading-snug text-text">
            <span className="font-semibold">{a.actorName}</span> {a.message}
            <span className="ml-1.5 text-faint"> · {a.taskTitle}</span>
            <span className="ml-1.5 font-mono text-xs text-faint">{timeAgo(a.createdAt)}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { status, role } = useRequireAuth();
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canView = role === 'ADMIN' || role === 'MANAGER';

  useEffect(() => {
    if (status !== 'authenticated' || !canView) return;
    apiFetch<DashboardSummary>('/dashboard')
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, [status, canView]);

  if (status !== 'authenticated') return null;

  const open = summary ? summary.statusCounts.TODO + summary.statusCounts.IN_PROGRESS : 0;
  const done = summary?.statusCounts.DONE ?? 0;
  const priorityData = summary
    ? PRIORITY_ORDER.map((p) => ({ label: PRIORITY_LABELS[p], value: summary.priorityCounts[p], color: PRIORITY_COLORS[p] }))
    : [];

  return (
    <div className="min-h-screen sm:pl-60">
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-8">
        {!canView ? (
          <>
            <h1 className="mb-6 text-xl font-bold text-text">Dashboard</h1>
            <p className="text-sm text-muted">Only admins and managers can view the dashboard.</p>
          </>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : loading || !summary ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 p-5" style={HERO_GRID_BG}>
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-wide text-muted">Manager overview</p>
                  <h1 className="mt-1 text-xl font-bold tracking-tight text-text">
                    {greeting()}, {user?.name?.split(' ')[0] ?? 'there'}
                  </h1>
                  <p className="mt-1 text-sm text-muted">
                    {open} open ·{' '}
                    <span className={summary.overdueCount > 0 ? 'font-medium text-red-500' : 'text-muted'}>{summary.overdueCount} overdue</span> ·{' '}
                    {done} done
                  </p>
                </div>
                <Link
                  href="/tasks"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:brightness-95"
                >
                  <Icon path={ICON_PATHS.plus} className="h-4 w-4" />
                  New task
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Open tasks" value={open} sub="across all clients" iconPath={ICON_PATHS.tasks} tone="#0EA5E9" />
              <Metric label="Overdue" value={summary.overdueCount} sub="need attention" iconPath={ICON_PATHS.overdue} tone="#EF4444" />
              <Metric
                label="On-time rate"
                value={summary.onTimeRate !== null ? `${summary.onTimeRate}%` : '—'}
                sub="last 7 days"
                iconPath={ICON_PATHS.trending}
                tone="#22C55E"
              />
              <Metric label="In progress" value={summary.statusCounts.IN_PROGRESS} sub="being worked now" iconPath={ICON_PATHS.clock} tone="#2563EB" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-card border border-border bg-surface p-4">
                <h2 className="mb-3 text-sm font-bold text-text">Tasks by status</h2>
                <StatusBarChart statusCounts={summary.statusCounts} />
              </div>
              <div className="rounded-card border border-border bg-surface p-4">
                <h2 className="mb-3 text-sm font-bold text-text">Priority split</h2>
                <div className="flex items-center gap-5">
                  <DonutChart data={priorityData} />
                  <div className="flex flex-1 flex-col gap-2">
                    {priorityData.map((d) => (
                      <div key={d.label} className="flex items-center gap-2 text-xs text-muted">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
                        {d.label} · <span className="font-semibold text-text">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-card border border-border bg-surface p-4">
                <h2 className="mb-3 text-sm font-bold text-text">Open workload by member</h2>
                <WorkloadBars members={summary.memberWorkload} />
              </div>
              <div className="rounded-card border border-border bg-surface p-4">
                <h2 className="mb-1 text-sm font-bold text-text">Recent activity</h2>
                <ActivityFeed items={summary.recentActivity} />
              </div>
            </div>

            <div className="rounded-card border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-bold text-text">Overdue tasks</h2>
              {summary.overdueTasks.length === 0 ? (
                <p className="text-sm text-muted">Nothing overdue.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {summary.overdueTasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <Link href={`/tasks/${t.id}`} className="flex-1 truncate text-text hover:text-accent hover:underline">
                        {t.title}
                      </Link>
                      <span className="shrink-0 text-xs text-muted">
                        {t.assigneeNames.length > 0 ? t.assigneeNames.join(', ') : 'Unassigned'}
                      </span>
                      <span className="shrink-0 text-xs text-red-500">{formatDueDate(t.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {summary.overdueCount > summary.overdueTasks.length && (
                <p className="mt-2 text-xs text-muted">+{summary.overdueCount - summary.overdueTasks.length} more</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
