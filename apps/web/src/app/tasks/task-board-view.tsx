'use client';

import Link from 'next/link';
import { TASK_STATUSES, type TaskStatusName, type TaskSummary } from '@madre-pulse/shared';

const STATUS_LABELS: Record<TaskStatusName, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  TO_VERIFY: 'To Verify',
  FAILED: 'Failed',
  DONE: 'Completed',
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-surface text-muted',
  MEDIUM: 'bg-surface text-text',
  HIGH: 'bg-amber-100 text-amber-700',
  URGENT: 'bg-red-100 text-red-700',
};

interface TaskBoardViewProps {
  tasks: TaskSummary[];
}

export function TaskBoardView({ tasks }: TaskBoardViewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {TASK_STATUSES.map((status) => (
        <BoardColumn key={status} status={status} tasks={tasks.filter((t) => t.status === status)} />
      ))}
    </div>
  );
}

function BoardColumn({ status, tasks }: { status: TaskStatusName; tasks: TaskSummary[] }) {
  return (
    <div data-testid={`board-column-${status}`} className="min-h-[240px] rounded-card border border-border bg-surface p-3">
      <h3 className="mb-3 text-sm font-semibold text-text">
        {STATUS_LABELS[status]} <span className="font-normal text-muted">({tasks.length})</span>
      </h3>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: TaskSummary }) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      data-testid={`task-card-${task.id}`}
      className="block rounded-card border border-border bg-surface-alt p-3 text-sm hover:border-accent"
    >
      <div className="mb-1 font-medium text-text">{task.title}</div>
      <div className="flex items-center gap-2 text-xs">
        <span className={`rounded px-1.5 py-0.5 ${PRIORITY_STYLES[task.priority] ?? ''}`}>{task.priority}</span>
        {task.dueDate && (
          <span className="text-muted">
            {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      {task.assignees.length > 0 && (
        <div className="mt-2 flex items-center -space-x-1.5">
          {task.assignees.map((a) => (
            <span
              key={a.userId}
              title={a.name}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-surface text-[9px] font-semibold text-white"
              style={{ backgroundColor: a.avatarColor }}
            >
              {a.initials}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
