'use client';

import { useMemo, useState } from 'react';
import type { TaskSummary } from '@madre-pulse/shared';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-muted',
  MEDIUM: 'bg-accent',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

// Builds a "YYYY-MM-DD" key from local Y/M/D components — used for both the
// grid days (built with the local Date constructor) and task due dates
// (sliced straight from the ISO string) so the two never cross a timezone
// conversion and drift by a day relative to each other.
function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isoDateKey(iso: string): string {
  return iso.slice(0, 10);
}

interface TaskCalendarViewProps {
  tasks: TaskSummary[];
}

export function TaskCalendarView({ tasks }: TaskCalendarViewProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskSummary[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const key = isoDateKey(task.dueDate);
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return map;
  }, [tasks]);

  const gridDays = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(new Date(year, month, 1 - startOffset + i));
    }
    return days;
  }, [year, month]);

  function goToMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  function goToToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            aria-label="Previous month"
            className="rounded-card border border-border px-2 py-1 text-sm text-text hover:bg-surface-alt"
          >
            ‹
          </button>
          <h2 className="w-40 text-center text-sm font-semibold text-text">{monthLabel}</h2>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            aria-label="Next month"
            className="rounded-card border border-border px-2 py-1 text-sm text-text hover:bg-surface-alt"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={goToToday}
          className="rounded-card border border-border px-3 py-1 text-sm text-text hover:bg-surface-alt"
        >
          Today
        </button>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-card border border-border">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="border-b border-border bg-surface-alt px-2 py-1 text-center text-xs font-medium text-muted"
          >
            {label}
          </div>
        ))}
        {gridDays.map((day) => {
          const key = dateKey(day.getFullYear(), day.getMonth(), day.getDate());
          const dayTasks = tasksByDay.get(key) ?? [];
          const inCurrentMonth = day.getMonth() === month;
          const isToday = key === todayKey;

          return (
            <div
              key={key}
              data-testid={`calendar-day-${key}`}
              className={`min-h-[90px] border-b border-r border-border p-1 last:border-r-0 ${inCurrentMonth ? 'bg-surface' : 'bg-canvas'}`}
            >
              <div
                className={
                  isToday
                    ? 'mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs text-white'
                    : `mb-1 text-xs ${inCurrentMonth ? 'text-text' : 'text-faint'}`
                }
              >
                {day.getDate()}
              </div>
              <div className="flex flex-col gap-0.5">
                {dayTasks.slice(0, 3).map((task) => (
                  <div
                    key={task.id}
                    data-testid={`calendar-task-${task.id}`}
                    title={task.title}
                    className="flex items-center gap-1 truncate rounded bg-surface-alt px-1 py-0.5 text-xs text-text"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority] ?? 'bg-muted'}`} />
                    <span className="truncate">{task.title}</span>
                  </div>
                ))}
                {dayTasks.length > 3 && <div className="text-xs text-muted">+{dayTasks.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
