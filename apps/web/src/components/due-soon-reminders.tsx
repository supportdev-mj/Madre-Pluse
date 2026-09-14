'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { TaskSummary } from '@madre-pulse/shared';
import { apiFetch } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';

const THRESHOLDS = [
  { id: '24h', ms: 24 * 60 * 60 * 1000, label: '24 hours' },
  { id: '12h', ms: 12 * 60 * 60 * 1000, label: '12 hours' },
  { id: '1h', ms: 60 * 60 * 1000, label: '1 hour' },
] as const;
type ThresholdId = (typeof THRESHOLDS)[number]['id'];

const CHECK_INTERVAL_MS = 60_000;
const SNOOZE_MS = 15 * 60 * 1000;
const STORAGE_PREFIX = 'madre-pulse-due-reminder:';

interface ReminderState {
  status: 'dismissed' | 'snoozed';
  until?: number;
}

function readState(taskId: string, thresholdId: ThresholdId): ReminderState | null {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${taskId}:${thresholdId}`);
    return raw ? (JSON.parse(raw) as ReminderState) : null;
  } catch {
    return null; // private browsing, storage disabled, etc. — just re-prompt every check instead of crashing
  }
}

function writeState(taskId: string, thresholdId: ThresholdId, state: ReminderState): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${taskId}:${thresholdId}`, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/** Dismissing a threshold also silences every milder one for the same task — once you've been
 * told "due within the hour", a follow-up "due within 24 hours" nudge right after is just noise.
 * THRESHOLDS is ordered mildest-first, so this marks everything up to and including `thresholdId`. */
function dismissThresholdAndMilder(taskId: string, thresholdId: ThresholdId): void {
  const idx = THRESHOLDS.findIndex((t) => t.id === thresholdId);
  for (let i = 0; i <= idx; i++) {
    writeState(taskId, THRESHOLDS[i].id, { status: 'dismissed' });
  }
}

interface ActiveReminder {
  task: TaskSummary;
  thresholdId: ThresholdId;
}

/** Mounted once, app-wide (see layout.tsx) — periodically checks the signed-in user's own
 * assigned, still-open tasks against three deadline thresholds (24h/12h/1h out) and surfaces a
 * small dismissible toast, bottom-left, the first time each threshold is crossed. State (dismissed
 * vs. snoozed-until) is kept in localStorage per task+threshold, so a reminder already acted on
 * doesn't keep re-appearing, while later, more urgent thresholds still get their own nudge. */
export function DueSoonReminders() {
  const { status, user } = useAuth();
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [activeReminder, setActiveReminder] = useState<ActiveReminder | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || !user) return;
    let cancelled = false;

    async function check() {
      try {
        const data = await apiFetch<TaskSummary[]>(`/tasks?assigneeId=${user!.id}`);
        if (!cancelled) setTasks(data);
      } catch {
        // Reminders are a nice-to-have — a failed background check shouldn't surface an error banner.
      }
    }

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [status, user]);

  // Re-evaluates whenever fresh task data comes in (every CHECK_INTERVAL_MS) — that periodic
  // refresh is also what re-checks whether a snooze has expired, no separate timer needed.
  useEffect(() => {
    if (activeReminder) return; // one toast at a time
    const now = Date.now();

    for (const task of tasks) {
      if (task.status === 'DONE' || !task.dueDate) continue;
      const remaining = new Date(task.dueDate).getTime() - now;
      if (remaining <= 0) continue;

      // Most urgent threshold first, so a task that's now under an hour out surfaces that
      // reminder, not a stale 24-hour one.
      for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
        const threshold = THRESHOLDS[i];
        if (remaining > threshold.ms) continue;
        const state = readState(task.id, threshold.id);
        if (state?.status === 'dismissed') continue;
        if (state?.status === 'snoozed' && state.until && state.until > now) continue;
        setActiveReminder({ task, thresholdId: threshold.id });
        return;
      }
    }
  }, [tasks, activeReminder]);

  if (!activeReminder) return null;
  const threshold = THRESHOLDS.find((t) => t.id === activeReminder.thresholdId)!;

  function onDismiss() {
    if (!activeReminder) return;
    dismissThresholdAndMilder(activeReminder.task.id, activeReminder.thresholdId);
    setActiveReminder(null);
  }

  function onSnooze() {
    if (!activeReminder) return;
    writeState(activeReminder.task.id, activeReminder.thresholdId, { status: 'snoozed', until: Date.now() + SNOOZE_MS });
    setActiveReminder(null);
  }

  return (
    <div
      className="fixed bottom-4 left-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface p-4 shadow-lg sm:left-[16.5rem]"
      style={{ animation: 'toast-in 0.3s ease-out' }}
      role="status"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">Due in {threshold.label}</p>
          <Link href={`/tasks/${activeReminder.task.id}`} className="mt-0.5 block truncate text-sm text-accent hover:underline">
            {activeReminder.task.title}
          </Link>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onSnooze}
              className="rounded-card border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-alt"
            >
              Remind me later
            </button>
            <button type="button" onClick={onDismiss} className="rounded-card px-3 py-1.5 text-xs font-medium text-muted hover:text-text">
              Dismiss
            </button>
          </div>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Close" className="shrink-0 text-muted hover:text-text">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
