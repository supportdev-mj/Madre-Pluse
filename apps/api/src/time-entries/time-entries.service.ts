import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { TimeEntrySummary, UpdateTimeEntryInput } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { getTaskVisibleUserIds, taskVisibilityWhere } from '../common/tenant/task-visibility';
import { PrismaService } from '../prisma/prisma.service';

interface TimeEntryRecord {
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
}

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async list(taskId: string): Promise<TimeEntrySummary[]> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);

    const entries = await this.prisma.timeEntry.findMany({
      where: { taskId },
      include: { user: true },
      orderBy: { date: 'desc' },
    });
    return entries.map((e) => this.toSummary(e));
  }

  async update(taskId: string, entryId: string, input: UpdateTimeEntryInput): Promise<TimeEntrySummary> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);

    const existing = await this.prisma.timeEntry.findFirst({ where: { id: entryId, taskId } });
    if (!existing) throw new NotFoundException('Time entry not found');
    this.assertCanModify(existing);

    const entry = await this.prisma.timeEntry.update({
      where: { id: entryId },
      data: { minutes: input.minutes, note: input.note, date: input.date },
      include: { user: true },
    });
    return this.toSummary(entry);
  }

  private assertCanModify(entry: { userId: string }): void {
    const role = this.cls.get('role');
    const userId = this.cls.get('userId');
    if (role === 'ADMIN' || role === 'MANAGER' || entry.userId === userId) return;
    throw new ForbiddenException('You can only modify your own time entries');
  }

  private async getTaskOrThrow(taskId: string, orgId: string) {
    const visibleUserIds = await getTaskVisibleUserIds(this.prisma, this.cls, orgId);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId, ...taskVisibilityWhere(visibleUserIds) },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private toSummary(e: TimeEntryRecord): TimeEntrySummary {
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
}
