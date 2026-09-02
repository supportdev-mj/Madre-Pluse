import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { CreateSubtaskInput, SubtaskSummary, UpdateSubtaskInput } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanModifyTask } from '../tasks/task-permissions';

interface SubtaskRecord {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  assignee: { id: string; name: string; initials: string; avatarColor: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const SUBTASK_INCLUDE = { assignee: true } as const;

@Injectable()
export class SubtasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async list(taskId: string): Promise<SubtaskSummary[]> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);
    const subtasks = await this.prisma.subtask.findMany({
      where: { taskId },
      include: SUBTASK_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return subtasks.map((s) => this.toSummary(s));
  }

  async create(taskId: string, input: CreateSubtaskInput): Promise<SubtaskSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    assertCanModifyTask(this.cls, { assigneeIds: task.assignments.map((a) => a.userId), createdById: task.createdById });

    if (input.assigneeId) this.assertValidSubtaskAssignee(input.assigneeId, task.assignments);

    const subtask = await this.prisma.subtask.create({
      data: { taskId, title: input.title, assigneeId: input.assigneeId ?? null },
      include: SUBTASK_INCLUDE,
    });
    return this.toSummary(subtask);
  }

  async update(taskId: string, subtaskId: string, input: UpdateSubtaskInput): Promise<SubtaskSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    assertCanModifyTask(this.cls, { assigneeIds: task.assignments.map((a) => a.userId), createdById: task.createdById });

    const existing = await this.prisma.subtask.findFirst({ where: { id: subtaskId, taskId } });
    if (!existing) throw new NotFoundException('Subtask not found');

    if (input.assigneeId) this.assertValidSubtaskAssignee(input.assigneeId, task.assignments);

    const subtask = await this.prisma.subtask.update({
      where: { id: subtaskId },
      data: { title: input.title, done: input.done, assigneeId: input.assigneeId },
      include: SUBTASK_INCLUDE,
    });
    return this.toSummary(subtask);
  }

  async remove(taskId: string, subtaskId: string): Promise<void> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    assertCanModifyTask(this.cls, { assigneeIds: task.assignments.map((a) => a.userId), createdById: task.createdById });

    const existing = await this.prisma.subtask.findFirst({ where: { id: subtaskId, taskId } });
    if (!existing) throw new NotFoundException('Subtask not found');
    await this.prisma.subtask.delete({ where: { id: subtaskId } });
  }

  /** A subtask's owner must be one of the parent task's current assignees — keeps ownership inside the team already on the task. */
  private assertValidSubtaskAssignee(assigneeId: string, taskAssignments: { userId: string }[]): void {
    if (!taskAssignments.some((a) => a.userId === assigneeId)) {
      throw new BadRequestException('Subtask assignee must be one of the task’s assignees');
    }
  }

  private async getTaskOrThrow(taskId: string, orgId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId },
      include: { assignments: { select: { userId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private toSummary(s: SubtaskRecord): SubtaskSummary {
    return {
      id: s.id,
      taskId: s.taskId,
      title: s.title,
      done: s.done,
      assignee: s.assignee
        ? { userId: s.assignee.id, name: s.assignee.name, initials: s.assignee.initials, avatarColor: s.assignee.avatarColor }
        : null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}
