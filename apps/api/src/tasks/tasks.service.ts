import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { TaskActivityType } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type {
  CreateTaskInput,
  ListTasksQuery,
  TaskActivitySummary,
  TaskActivityTypeName,
  TaskPriorityName,
  TaskStatusName,
  TaskSummary,
  UpdateTaskInput,
} from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
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
  assignments: { user: { id: string; name: string; initials: string; avatarColor: string } }[];
  createdById: string;
  createdBy: { name: string };
  createdAt: Date;
  updatedAt: Date;
}

const TASK_INCLUDE = {
  project: true,
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
    const tasks = await this.prisma.task.findMany({
      where: {
        orgId,
        status: query.status,
        priority: query.priority,
        projectId: query.projectId,
        assignments: query.assigneeId ? { some: { userId: query.assigneeId } } : undefined,
      },
      include: TASK_INCLUDE,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
    return tasks.map((t) => this.toSummary(t));
  }

  async get(id: string): Promise<TaskSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.prisma.task.findFirst({
      where: { id, orgId },
      include: TASK_INCLUDE,
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.toSummary(task);
  }

  async create(input: CreateTaskInput): Promise<TaskSummary> {
    const orgId = requireOrgId(this.cls);
    const createdById = this.currentUserId();
    const assigneeIds = [...new Set(input.assigneeIds ?? [])];

    if (input.projectId) await this.assertProjectInOrg(input.projectId, orgId);
    for (const userId of assigneeIds) await this.assertActiveMemberOfOrg(userId, orgId);

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          orgId,
          createdById,
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? 'TODO',
          priority: input.priority ?? 'MEDIUM',
          dueDate: input.dueDate ?? null,
          projectId: input.projectId ?? null,
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

    return this.toSummary(task);
  }

  async update(id: string, input: UpdateTaskInput): Promise<TaskSummary> {
    const orgId = requireOrgId(this.cls);
    const existing = await this.prisma.task.findFirst({
      where: { id, orgId },
      include: { assignments: true },
    });
    if (!existing) throw new NotFoundException('Task not found');

    assertCanModifyTask(this.cls, { assigneeIds: existing.assignments.map((a) => a.userId), createdById: existing.createdById });

    if (input.projectId) await this.assertProjectInOrg(input.projectId, orgId);
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

    return this.toSummary(task);
  }

  async remove(id: string): Promise<void> {
    const orgId = requireOrgId(this.cls);
    const existing = await this.prisma.task.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Task not found');
    await this.prisma.task.delete({ where: { id } });
  }

  async listActivity(taskId: string): Promise<TaskActivitySummary[]> {
    const orgId = requireOrgId(this.cls);
    const task = await this.prisma.task.findFirst({ where: { id: taskId, orgId } });
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

  private async assertActiveMemberOfOrg(userId: string, orgId: string): Promise<void> {
    const membership = await this.prisma.membership.findFirst({ where: { userId, orgId, status: 'ACTIVE' } });
    if (!membership) throw new BadRequestException('Assignee is not an active member of this organization');
  }

  private toSummary(t: TaskRecord): TaskSummary {
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status as TaskStatusName,
      priority: t.priority as TaskPriorityName,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      projectId: t.projectId,
      projectName: t.project?.name ?? null,
      assignees: t.assignments.map((a) => ({
        userId: a.user.id,
        name: a.user.name,
        initials: a.user.initials,
        avatarColor: a.user.avatarColor,
      })),
      createdById: t.createdById,
      createdByName: t.createdBy.name,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
