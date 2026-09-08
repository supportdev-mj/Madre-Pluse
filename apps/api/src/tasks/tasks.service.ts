import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { TaskActivityType } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type {
  AssignmentStatusName,
  CreateTaskInput,
  DecideVerificationInput,
  ListTasksQuery,
  NotificationTypeName,
  TaskActivitySummary,
  TaskActivityTypeName,
  TaskPriorityName,
  TaskStatusName,
  TaskSummary,
  TimeEntrySummary,
  UpdateTaskInput,
  VerificationDecision,
} from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { getDirectReportUserIds, getTaskVisibleUserIds, taskVisibilityWhere } from '../common/tenant/task-visibility';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanModifyTask } from './task-permissions';

interface PendingActivity {
  type: TaskActivityType;
  message: string;
}

interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  projectId: string | null;
  project: { name: string } | null;
  clientId: string | null;
  client: { name: string } | null;
  assignments: {
    status: string;
    activeStartedAt: Date | null;
    completedAt: Date | null;
    user: { id: string; name: string; initials: string; avatarColor: string };
  }[];
  createdById: string;
  createdBy: { name: string };
  createdAt: Date;
  updatedAt: Date;
}

const TASK_INCLUDE = {
  project: true,
  client: true,
  createdBy: true,
  assignments: { include: { user: true } },
} as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListTasksQuery): Promise<TaskSummary[]> {
    const orgId = requireOrgId(this.cls);
    const visibleUserIds = await getTaskVisibleUserIds(this.prisma, this.cls, orgId);
    const tasks = await this.prisma.task.findMany({
      where: {
        orgId,
        status: query.status,
        priority: query.priority,
        projectId: query.projectId,
        assignments: query.assigneeId ? { some: { userId: query.assigneeId } } : undefined,
        ...taskVisibilityWhere(visibleUserIds),
      },
      include: TASK_INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
    // Computed once for the whole list rather than per-row, to avoid an N+1 query.
    const role = this.cls.get('role');
    const reportIds = role === 'MANAGER' ? await getDirectReportUserIds(this.prisma, this.cls, orgId) : [];
    return tasks.map((t) =>
      this.toSummary(t, this.canVerifyGiven(t.status, t.assignments.map((a) => a.user.id), role, reportIds)),
    );
  }

  async get(id: string): Promise<TaskSummary> {
    const orgId = requireOrgId(this.cls);
    const visibleUserIds = await getTaskVisibleUserIds(this.prisma, this.cls, orgId);
    const task = await this.prisma.task.findFirst({
      where: { id, orgId, ...taskVisibilityWhere(visibleUserIds) },
      include: TASK_INCLUDE,
    });
    if (!task) throw new NotFoundException('Task not found');
    const canVerify = await this.computeCanVerify(orgId, task.status, task.assignments.map((a) => a.user.id));
    return this.toSummary(task, canVerify);
  }

  async create(input: CreateTaskInput): Promise<TaskSummary> {
    const orgId = requireOrgId(this.cls);
    const createdById = this.currentUserId();
    const assigneeIds = [...new Set(input.assigneeIds ?? [])];

    if (input.projectId) await this.assertProjectInOrg(input.projectId, orgId);
    if (input.clientId) await this.assertClientInOrg(input.clientId, orgId);
    for (const userId of assigneeIds) await this.assertActiveMemberOfOrg(userId, orgId);

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          orgId,
          createdById,
          title: input.title,
          description: input.description,
          status: input.status ?? 'TODO',
          priority: input.priority ?? 'MEDIUM',
          dueDate: input.dueDate,
          projectId: input.projectId ?? null,
          clientId: input.clientId ?? null,
          completedAt: (input.status ?? 'TODO') === 'DONE' ? new Date() : null,
          assignments: { createMany: { data: assigneeIds.map((userId) => ({ userId })) } },
        },
        include: TASK_INCLUDE,
      });
      await tx.taskActivity.create({
        data: { taskId: created.id, actorId: createdById, type: 'CREATED', message: 'created this task' },
      });
      return created;
    });

    for (const userId of assigneeIds) {
      if (userId === createdById) continue;
      await this.notifications.notify({
        orgId,
        userId,
        type: 'TASK_ASSIGNED',
        message: `You were assigned to "${task.title}"`,
        taskId: task.id,
      });
    }

    // A freshly created task is never realistically awaiting verification.
    return this.toSummary(task, false);
  }

  async update(id: string, input: UpdateTaskInput): Promise<TaskSummary> {
    const orgId = requireOrgId(this.cls);
    const visibleUserIds = await getTaskVisibleUserIds(this.prisma, this.cls, orgId);
    const existing = await this.prisma.task.findFirst({
      where: { id, orgId, ...taskVisibilityWhere(visibleUserIds) },
      include: { assignments: true },
    });
    if (!existing) throw new NotFoundException('Task not found');

    assertCanModifyTask(this.cls, { assigneeIds: existing.assignments.map((a) => a.userId), createdById: existing.createdById });

    // DONE and FAILED are only ever reachable through the verification flow (verifyTask), never a
    // direct edit — this keeps "who decided this" meaningful and mirrors how reopen-requests
    // already can't be toggled directly.
    if (input.status === 'DONE' || input.status === 'FAILED') {
      throw new BadRequestException('A task can only reach Done or Failed by verifying it — see the To Verify workflow');
    }

    if (input.projectId) await this.assertProjectInOrg(input.projectId, orgId);
    if (input.clientId) await this.assertClientInOrg(input.clientId, orgId);
    const nextAssigneeIds = input.assigneeIds !== undefined ? [...new Set(input.assigneeIds)] : undefined;
    if (nextAssigneeIds) for (const userId of nextAssigneeIds) await this.assertActiveMemberOfOrg(userId, orgId);

    const existingAssigneeIds = existing.assignments.map((a) => a.userId);
    const activities = await this.buildChangeActivities(existing, existingAssigneeIds, input, nextAssigneeIds);
    const actorId = this.currentUserId();
    const completedAt = this.computeCompletedAt(existing.status, input.status);

    const task = await this.prisma.$transaction(async (tx) => {
      if (nextAssigneeIds) {
        await tx.taskAssignment.deleteMany({ where: { taskId: id } });
        if (nextAssigneeIds.length > 0) {
          await tx.taskAssignment.createMany({ data: nextAssigneeIds.map((userId) => ({ taskId: id, userId })) });
        }
      }
      const updated = await tx.task.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          dueDate: input.dueDate,
          projectId: input.projectId,
          clientId: input.clientId,
          completedAt,
        },
        include: TASK_INCLUDE,
      });
      if (activities.length > 0) {
        await tx.taskActivity.createMany({
          data: activities.map((a) => ({ taskId: id, actorId, type: a.type, message: a.message })),
        });
      }
      return updated;
    });

    if (nextAssigneeIds) {
      const newlyAdded = nextAssigneeIds.filter((userId) => !existingAssigneeIds.includes(userId));
      for (const userId of newlyAdded) {
        if (userId === actorId) continue;
        await this.notifications.notify({
          orgId,
          userId,
          type: 'TASK_ASSIGNED',
          message: `You were assigned to "${task.title}"`,
          taskId: task.id,
        });
      }
    }

    if (existing.status !== 'TO_VERIFY' && task.status === 'TO_VERIFY') {
      await this.notifyManagerOfVerificationRequest(orgId, actorId, task);
    }

    const canVerify = await this.computeCanVerify(orgId, task.status, task.assignments.map((a) => a.userId));
    return this.toSummary(task, canVerify);
  }

  /** Starts the CURRENT user's own personal time-tracking session on a task they're assigned to.
   * Re-startable after a prior COMPLETED session (logs another session, doesn't reopen the old one).
   * If this is the task's first-ever Start (still TODO) — or a resume after a rejected verification
   * (FAILED) — auto-advances the shared task status to IN_PROGRESS. Personal Complete never
   * auto-advances the shared status to DONE (that stays a deliberate action via verification),
   * since other assignees may still be working. */
  async startTracking(taskId: string): Promise<TaskSummary> {
    const orgId = requireOrgId(this.cls);
    const userId = this.currentUserId();
    const visibleUserIds = await getTaskVisibleUserIds(this.prisma, this.cls, orgId);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId, ...taskVisibilityWhere(visibleUserIds) },
      include: { assignments: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const assignment = task.assignments.find((a) => a.userId === userId);
    if (!assignment) throw new ForbiddenException('Only an assignee can track time on this task');
    if (assignment.status === 'IN_PROGRESS') {
      throw new BadRequestException('You already have this task in progress');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.taskAssignment.update({
        where: { id: assignment.id },
        data: { status: 'IN_PROGRESS', activeStartedAt: now },
      });
      if (task.status === 'TODO' || task.status === 'FAILED') {
        await tx.task.update({ where: { id: taskId }, data: { status: 'IN_PROGRESS' } });
        await tx.taskActivity.create({
          data: {
            taskId,
            actorId: userId,
            type: 'STATUS_CHANGED',
            message: `changed status from ${task.status} to IN_PROGRESS (started work)`,
          },
        });
      }
    });

    return this.get(taskId);
  }

  /** Stops the current user's own active session, logging it as a TimeEntry (with startedAt/endedAt
   * so the UI can show exactly when it ran, not just a rounded duration). */
  async completeTracking(taskId: string): Promise<{ task: TaskSummary; timeEntry: TimeEntrySummary }> {
    const orgId = requireOrgId(this.cls);
    const userId = this.currentUserId();
    const visibleUserIds = await getTaskVisibleUserIds(this.prisma, this.cls, orgId);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId, ...taskVisibilityWhere(visibleUserIds) },
      include: { assignments: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const assignment = task.assignments.find((a) => a.userId === userId);
    if (!assignment || assignment.status !== 'IN_PROGRESS' || !assignment.activeStartedAt) {
      throw new BadRequestException('You do not have this task in progress');
    }

    const startedAt = assignment.activeStartedAt;
    const endedAt = new Date();
    const minutes = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));

    const [, timeEntry] = await this.prisma.$transaction([
      this.prisma.taskAssignment.update({
        where: { id: assignment.id },
        data: { status: 'COMPLETED', activeStartedAt: null, completedAt: endedAt },
      }),
      this.prisma.timeEntry.create({
        data: { taskId, userId, minutes, date: endedAt, startedAt, endedAt },
        include: { user: true },
      }),
    ]);

    return { task: await this.get(taskId), timeEntry: this.toTimeEntrySummary(timeEntry) };
  }

  async remove(id: string): Promise<void> {
    const orgId = requireOrgId(this.cls);
    const visibleUserIds = await getTaskVisibleUserIds(this.prisma, this.cls, orgId);
    const existing = await this.prisma.task.findFirst({ where: { id, orgId, ...taskVisibilityWhere(visibleUserIds) } });
    if (!existing) throw new NotFoundException('Task not found');
    await this.prisma.task.delete({ where: { id } });
  }

  async listActivity(taskId: string): Promise<TaskActivitySummary[]> {
    const orgId = requireOrgId(this.cls);
    const visibleUserIds = await getTaskVisibleUserIds(this.prisma, this.cls, orgId);
    const task = await this.prisma.task.findFirst({ where: { id: taskId, orgId, ...taskVisibilityWhere(visibleUserIds) } });
    if (!task) throw new NotFoundException('Task not found');

    const activities = await this.prisma.taskActivity.findMany({
      where: { taskId },
      include: { actor: true },
      orderBy: { createdAt: 'asc' },
    });
    return activities.map((a) => ({
      id: a.id,
      type: a.type as TaskActivityTypeName,
      message: a.message,
      actorId: a.actorId,
      actorName: a.actor.name,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  private async buildChangeActivities(
    existing: { status: string; priority: string; dueDate: Date | null },
    existingAssigneeIds: string[],
    input: UpdateTaskInput,
    nextAssigneeIds: string[] | undefined,
  ): Promise<PendingActivity[]> {
    const activities: PendingActivity[] = [];

    if (input.status !== undefined && input.status !== existing.status) {
      activities.push({ type: 'STATUS_CHANGED', message: `changed status from ${existing.status} to ${input.status}` });
    }
    if (input.priority !== undefined && input.priority !== existing.priority) {
      activities.push({ type: 'PRIORITY_CHANGED', message: `changed priority from ${existing.priority} to ${input.priority}` });
    }
    if (nextAssigneeIds !== undefined) {
      const added = nextAssigneeIds.filter((id) => !existingAssigneeIds.includes(id));
      const removed = existingAssigneeIds.filter((id) => !nextAssigneeIds.includes(id));
      if (added.length > 0 || removed.length > 0) {
        const [addedUsers, removedUsers] = await Promise.all([
          added.length > 0 ? this.prisma.user.findMany({ where: { id: { in: added } }, select: { name: true } }) : [],
          removed.length > 0 ? this.prisma.user.findMany({ where: { id: { in: removed } }, select: { name: true } }) : [],
        ]);
        const parts: string[] = [];
        if (addedUsers.length > 0) parts.push(`added ${addedUsers.map((u) => u.name).join(', ')}`);
        if (removedUsers.length > 0) parts.push(`removed ${removedUsers.map((u) => u.name).join(', ')}`);
        activities.push({ type: 'ASSIGNEE_CHANGED', message: `${parts.join('; ')} as assignee(s)` });
      }
    }
    if (input.dueDate !== undefined && (input.dueDate?.getTime() ?? null) !== (existing.dueDate?.getTime() ?? null)) {
      const to = input.dueDate ? input.dueDate.toISOString().slice(0, 10) : 'no due date';
      activities.push({ type: 'DUE_DATE_CHANGED', message: `changed due date to ${to}` });
    }

    return activities;
  }

  /** undefined = leave completedAt untouched; a Date = task just completed; null = task just left DONE. */
  private computeCompletedAt(existingStatus: string, nextStatus: string | undefined): Date | null | undefined {
    if (nextStatus === undefined || nextStatus === existingStatus) return undefined;
    if (nextStatus === 'DONE') return new Date();
    if (existingStatus === 'DONE') return null;
    return undefined;
  }

  private currentUserId(): string {
    const userId = this.cls.get('userId');
    if (!userId) throw new ForbiddenException();
    return userId;
  }

  private async assertProjectInOrg(projectId: string, orgId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, orgId } });
    if (!project) throw new BadRequestException('Project not found in this organization');
  }

  private async assertClientInOrg(clientId: string, orgId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, orgId } });
    if (!client) throw new BadRequestException('Client not found in this organization');
  }

  private async assertActiveMemberOfOrg(userId: string, orgId: string): Promise<void> {
    const membership = await this.prisma.membership.findFirst({ where: { userId, orgId, status: 'ACTIVE' } });
    if (!membership) throw new BadRequestException('Assignee is not an active member of this organization');
  }

  private toTimeEntrySummary(e: {
    id: string;
    taskId: string;
    userId: string;
    user: { name: string };
    minutes: number;
    note: string | null;
    date: Date;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): TimeEntrySummary {
    return {
      id: e.id,
      taskId: e.taskId,
      userId: e.userId,
      userName: e.user.name,
      minutes: e.minutes,
      note: e.note,
      date: e.date.toISOString(),
      startedAt: e.startedAt ? e.startedAt.toISOString() : null,
      endedAt: e.endedAt ? e.endedAt.toISOString() : null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  /** Sync variant for list(): takes the role + a direct-report set precomputed once for the whole
   * page, rather than looking them up per row (which computeCanVerify does, for single-task calls). */
  private canVerifyGiven(status: string, assigneeUserIds: string[], role: string | undefined, reportIds: string[]): boolean {
    if (status !== 'TO_VERIFY') return false;
    if (role === 'ADMIN') return true;
    if (role !== 'MANAGER') return false;
    return assigneeUserIds.some((id) => reportIds.includes(id));
  }

  private async computeCanVerify(orgId: string, status: string, assigneeUserIds: string[]): Promise<boolean> {
    if (status !== 'TO_VERIFY') return false;
    const role = this.cls.get('role');
    if (role === 'ADMIN') return true;
    if (role !== 'MANAGER') return false;
    const reportIds = await getDirectReportUserIds(this.prisma, this.cls, orgId);
    return assigneeUserIds.some((id) => reportIds.includes(id));
  }

  /** A manager of at least one assignee (never of themself) or an ADMIN decides a task that's
   * awaiting verification: APPROVE (-> DONE, sets completedAt), SEND_BACK (-> IN_PROGRESS, more
   * work needed but not a failure), or REJECT (-> FAILED, the assignee must rework and resubmit).
   * This is the ONLY path that can ever move a task to DONE or FAILED. */
  async verifyTask(taskId: string, input: DecideVerificationInput): Promise<TaskSummary> {
    const orgId = requireOrgId(this.cls);
    const visibleUserIds = await getTaskVisibleUserIds(this.prisma, this.cls, orgId);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId, ...taskVisibilityWhere(visibleUserIds) },
      include: TASK_INCLUDE,
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.status !== 'TO_VERIFY') throw new BadRequestException('This task is not awaiting verification');

    const assigneeUserIds = task.assignments.map((a) => a.user.id);
    const canVerify = await this.computeCanVerify(orgId, task.status, assigneeUserIds);
    if (!canVerify) {
      throw new ForbiddenException('Only the immediate manager of an assignee (or an admin) may verify this task');
    }

    const actorId = this.currentUserId();
    const note = input.reviewNote ? `: ${input.reviewNote}` : '';
    const outcome: Record<VerificationDecision, { status: 'DONE' | 'IN_PROGRESS' | 'FAILED'; message: string; notify: NotificationTypeName; notifyMessage: string }> = {
      APPROVE: {
        status: 'DONE',
        message: `verified and approved this task${note}`,
        notify: 'TASK_VERIFIED',
        notifyMessage: `"${task.title}" was verified and marked complete`,
      },
      SEND_BACK: {
        status: 'IN_PROGRESS',
        message: `sent this task back for more work${note}`,
        notify: 'TASK_SENT_BACK',
        notifyMessage: `"${task.title}" was sent back for more work`,
      },
      REJECT: {
        status: 'FAILED',
        message: `rejected this task — verification failed${note}`,
        notify: 'TASK_VERIFICATION_REJECTED',
        notifyMessage: `"${task.title}" failed verification`,
      },
    };
    const { status: nextStatus, message, notify, notifyMessage } = outcome[input.decision];

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.task.update({
        where: { id: taskId },
        data: { status: nextStatus, completedAt: nextStatus === 'DONE' ? new Date() : null },
        include: TASK_INCLUDE,
      });
      await tx.taskActivity.create({ data: { taskId, actorId, type: 'STATUS_CHANGED', message } });
      return result;
    });

    for (const userId of assigneeUserIds) {
      if (userId === actorId) continue;
      await this.notifications.notify({ orgId, userId, type: notify, message: notifyMessage, taskId: updated.id });
    }

    return this.toSummary(updated, false);
  }

  /** Notifies the actor's immediate manager (if any) that a task now awaits their verification. */
  private async notifyManagerOfVerificationRequest(orgId: string, actorId: string, task: { id: string; title: string }): Promise<void> {
    const ownMembership = await this.prisma.membership.findFirst({ where: { userId: actorId, orgId } });
    if (!ownMembership?.managerId) return;
    const managerMembership = await this.prisma.membership.findUnique({ where: { id: ownMembership.managerId } });
    if (!managerMembership) return;

    await this.notifications.notify({
      orgId,
      userId: managerMembership.userId,
      type: 'TASK_VERIFICATION_REQUESTED',
      message: `"${task.title}" is awaiting your verification`,
      taskId: task.id,
    });
  }

  private toSummary(t: TaskRecord, canVerify: boolean): TaskSummary {
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status as TaskStatusName,
      priority: t.priority as TaskPriorityName,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      projectId: t.projectId,
      projectName: t.project?.name ?? null,
      clientId: t.clientId,
      clientName: t.client?.name ?? null,
      assignees: t.assignments.map((a) => ({
        userId: a.user.id,
        name: a.user.name,
        initials: a.user.initials,
        avatarColor: a.user.avatarColor,
        personalStatus: a.status as AssignmentStatusName,
        activeStartedAt: a.activeStartedAt ? a.activeStartedAt.toISOString() : null,
        completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      })),
      createdById: t.createdById,
      createdByName: t.createdBy.name,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      canVerify,
    };
  }
}
