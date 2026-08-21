import { Injectable, NotFoundException } from '@nestjs/common';
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
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SubtasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async list(taskId: string): Promise<SubtaskSummary[]> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);
    const subtasks = await this.prisma.subtask.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' } });
    return subtasks.map((s) => this.toSummary(s));
  }

  async create(taskId: string, input: CreateSubtaskInput): Promise<SubtaskSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    assertCanModifyTask(this.cls, task);

    const subtask = await this.prisma.subtask.create({ data: { taskId, title: input.title } });
    return this.toSummary(subtask);
  }

  async update(taskId: string, subtaskId: string, input: UpdateSubtaskInput): Promise<SubtaskSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    assertCanModifyTask(this.cls, task);

    const existing = await this.prisma.subtask.findFirst({ where: { id: subtaskId, taskId } });
    if (!existing) throw new NotFoundException('Subtask not found');

    const subtask = await this.prisma.subtask.update({
      where: { id: subtaskId },
      data: { title: input.title, done: input.done },
    });
    return this.toSummary(subtask);
  }

  async remove(taskId: string, subtaskId: string): Promise<void> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    assertCanModifyTask(this.cls, task);

    const existing = await this.prisma.subtask.findFirst({ where: { id: subtaskId, taskId } });
    if (!existing) throw new NotFoundException('Subtask not found');
    await this.prisma.subtask.delete({ where: { id: subtaskId } });
  }

  private async getTaskOrThrow(taskId: string, orgId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, orgId } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private toSummary(s: SubtaskRecord): SubtaskSummary {
    return {
      id: s.id,
      taskId: s.taskId,
      title: s.title,
      done: s.done,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}
