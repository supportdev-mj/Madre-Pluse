'use client';

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { TASK_STATUSES, type TaskStatusName, type TaskSummary } from '@madre-pulse/shared';

const STATUS_LABELS: Record<TaskStatusName, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-surface text-muted',
  MEDIUM: 'bg-surface text-text',
  HIGH: 'bg-amber-100 text-amber-700',
  URGENT: 'bg-red-100 text-red-700',
};

interface TaskBoardViewProps {
  tasks: TaskSummary[];
  canEditTask: (task: TaskSummary) => boolean;
  onStatusChange: (task: TaskSummary, status: TaskStatusName) => void;
}

export function TaskBoardView({ tasks, canEditTask, onStatusChange }: TaskBoardViewProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const nextStatus = over.id as TaskStatusName;
    const task = tasks.find((t) => t.id === active.id);
    if (!task || task.status === nextStatus) return;
    onStatusChange(task, nextStatus);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TASK_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={tasks.filter((t) => t.status === status)}
            canEditTask={canEditTask}
          />
        ))}
      </div>
    </DndContext>
  );
}

function BoardColumn({
  status,
  tasks,
  canEditTask,
}: {
  status: TaskStatusName;
  tasks: TaskSummary[];
  canEditTask: (task: TaskSummary) => boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      data-testid={`board-column-${status}`}
      className={`min-h-[240px] rounded-card border border-border p-3 transition-colors ${isOver ? 'bg-surface-alt' : 'bg-surface'}`}
    >
      <h3 className="mb-3 text-sm font-semibold text-text">
        {STATUS_LABELS[status]} <span className="font-normal text-muted">({tasks.length})</span>
      </h3>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} draggable={canEditTask(task)} />
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task, draggable }: { task: TaskSummary; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !draggable,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: isDragging ? 10 : undefined }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      data-testid={`task-card-${task.id}`}
      className={`rounded-card border border-border bg-surface-alt p-3 text-sm ${draggable ? 'cursor-grab touch-none active:cursor-grabbing' : 'opacity-70'}`}
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
    </div>
  );
}
