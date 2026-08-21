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
  assigneeId: string | null;
  assignee: { name: string } | null;
  createdById: string;
  createdBy: { name: string };
  createdAt: Date;
  updatedAt: Date;
}

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
        assigneeId: query.assigneeId,
        projectId: query.projectId,
      },
      include: { project: true, assignee: true, createdBy: true },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
    return tasks.map((t) => this.toSummary(t));
  }

  async get(id: string): Promise<TaskSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.prisma.task.findFirst({
      where: { id, orgId },
      include: { project: true, assignee: true, createdBy: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.toSummary(task);
  }

  async create(input: CreateTaskInput): Promise<TaskSummary> {
    const orgId = requireOrgId(this.cls);
    const createdById = this.currentUserId();

    if (input.projectId) await this.assertProjectInOrg(input.projectId, orgId);
    if (input.assigneeId) await this.assertActiveMemberOfOrg(input.assigneeId, orgId);

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
          assigneeId: input.assigneeId ?? null,
          completedAt: (input.status ?? 'TODO') === 'DONE' ? new Date() : null,
        },
        include: { project: true, assignee: true, createdBy: true },
      });
      await tx.taskActivity.create({
        data: { taskId: created.id, actorId: createdById, type: 'CREATED', message: 'created this task' },
      });
      return created;
    });

    if (task.assigneeId && task.assigneeId !== createdById) {
      await this.notifications.notify({
        orgId,
        userId: task.assigneeId,
        type: 'TASK_ASSIGNED',
        message: `You were assigned to "${task.title}"`,
        taskId: task.id,
      });
    }

    return this.toSummary(task);
  }

  async update(id: string, input: UpdateTaskInput): Promise<TaskSummary> {
    const orgId = requireOrgId(this.cls);
    const existing = await this.prisma.task.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Task not found');

    assertCanModifyTask(this.cls, existing);

    if (input.projectId) await this.assertProjectInOrg(input.projectId, orgId);
    if (input.assigneeId) await this.assertActiveMemberOfOrg(input.assigneeId, orgId);

    const activities = await this.buildChangeActivities(existing, input);
    const actorId = this.currentUserId();
    const completedAt = this.computeCompletedAt(existing.status, input.status);

    const task = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          dueDate: input.dueDate,
          projectId: input.projectId,
          assigneeId: input.assigneeId,
          completedAt,
        },
        include: { project: true, assignee: true, createdBy: true },
      });
      if (activities.length > 0) {
        await tx.taskActivity.createMany({
          data: activities.map((a) => ({ taskId: id, actorId, type: a.type, message: a.message })),
        });
      }
      return updated;
    });

    const reassigned = input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId;
    if (reassigned && input.assigneeId && input.assigneeId !== actorId) {
      await this.notifications.notify({
        orgId,
        userId: input.assigneeId,
        type: 'TASK_ASSIGNED',
        message: `You were assigned to "${task.title}"`,
        taskId: task.id,
      });
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
    existing: { status: string; priority: string; assigneeId: string | null; dueDate: Date | null },
    input: UpdateTaskInput,
  ): Promise<PendingActivity[]> {
    const activities: PendingActivity[] = [];

    if (input.status !== undefined && input.status !== existing.status) {
      activities.push({ type: 'STATUS_CHANGED', message: `changed status from ${existing.status} to ${input.status}` });
    }
    if (input.priority !== undefined && input.priority !== existing.priority) {
      activities.push({ type: 'PRIORITY_CHANGED', message: `changed priority from ${existing.priority} to ${input.priority}` });
    }
    if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) {
      const [oldUser, newUser] = await Promise.all([
        existing.assigneeId ? this.prisma.user.findUnique({ where: { id: existing.assigneeId }, select: { name: true } }) : null,
        input.assigneeId ? this.prisma.user.findUnique({ where: { id: input.assigneeId }, select: { name: true } }) : null,
      ]);
      activities.push({
        type: 'ASSIGNEE_CHANGED',
        message: `reassigned from ${oldUser?.name ?? 'Unassigned'} to ${newUser?.name ?? 'Unassigned'}`,
      });
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
      assigneeId: t.assigneeId,
      assigneeName: t.assignee?.name ?? null,
      createdById: t.createdById,
      createdByName: t.createdBy.name,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
