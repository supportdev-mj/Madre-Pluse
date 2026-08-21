'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DashboardSummary } from '@madre-pulse/shared';
import { AppNav } from '../../components/app-nav';
import { apiFetch } from '../../lib/api-client';
import { useRequireAuth } from '../../lib/use-require-auth';

const STATUS_ORDER = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
const STATUS_LABELS: Record<(typeof STATUS_ORDER)[number], string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};
const STATUS_BAR_COLORS: Record<(typeof STATUS_ORDER)[number], string> = {
  TODO: 'bg-faint',
  IN_PROGRESS: 'bg-accent',
  DONE: 'bg-green-500',
};

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { status, role } = useRequireAuth();
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

  const total = summary ? summary.statusCounts.TODO + summary.statusCounts.IN_PROGRESS + summary.statusCounts.DONE : 0;
  const maxOpen = summary ? Math.max(...summary.memberWorkload.map((m) => m.openCount), 1) : 1;

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="mx-auto max-w-4xl p-8">
        <h1 className="mb-6 text-xl font-bold text-text">Dashboard</h1>

        {!canView ? (
          <p className="text-sm text-muted">Only admins and managers can view the dashboard.</p>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : loading || !summary ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <>
            <div className="mb-2 grid grid-cols-3 gap-4">
              {STATUS_ORDER.map((s) => (
                <StatCard key={s} label={STATUS_LABELS[s]} value={summary.statusCounts[s]} />
              ))}
            </div>

            {total > 0 && (
              <div className="mb-6 flex h-3 overflow-hidden rounded-full border border-border">
                {STATUS_ORDER.map((s) => (
                  <div
                    key={s}
                    className={STATUS_BAR_COLORS[s]}
                    style={{ width: `${(summary.statusCounts[s] / total) * 100}%` }}
                  />
                ))}
              </div>
            )}

            <div className="mb-6 grid grid-cols-3 gap-4">
              <StatCard label="Overdue" value={summary.overdueCount} />
              <StatCard label="Completed (7 days)" value={summary.completedLast7Days} />
              <StatCard label="On-time rate" value={summary.onTimeRate !== null ? `${summary.onTimeRate}%` : '—'} />
            </div>

            <div className="mb-6 rounded-card border border-border bg-surface p-6">
              <h2 className="mb-4 text-base font-semibold text-text">Overdue tasks</h2>
              {summary.overdueTasks.length === 0 ? (
                <p className="text-sm text-muted">Nothing overdue.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {summary.overdueTasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <Link href={`/tasks/${t.id}`} className="flex-1 truncate text-text hover:text-accent hover:underline">
                        {t.title}
                      </Link>
                      <span className="shrink-0 text-xs text-muted">{t.assigneeName ?? 'Unassigned'}</span>
                      <span className="shrink-0 text-xs text-red-500">{formatDueDate(t.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {summary.overdueCount > summary.overdueTasks.length && (
                <p className="mt-2 text-xs text-muted">+{summary.overdueCount - summary.overdueTasks.length} more</p>
              )}
            </div>

            <div className="rounded-card border border-border bg-surface p-6">
              <h2 className="mb-4 text-base font-semibold text-text">Team workload</h2>
              {summary.memberWorkload.length === 0 ? (
                <p className="text-sm text-muted">No active members.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {summary.memberWorkload.map((m) => (
                    <div key={m.userId}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-text">{m.name}</span>
                        <span className="text-xs text-muted">
                          {m.openCount} open{m.overdueCount > 0 ? ` · ${m.overdueCount} overdue` : ''} · {m.doneCount} done
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(m.openCount / maxOpen) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
