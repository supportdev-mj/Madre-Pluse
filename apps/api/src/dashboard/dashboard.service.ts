import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { DashboardSummary, TaskPriorityName, TaskStatusName } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { PrismaService } from '../prisma/prisma.service';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const OVERDUE_PREVIEW_LIMIT = 10;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async getSummary(): Promise<DashboardSummary> {
    const orgId = requireOrgId(this.cls);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS);

    const [statusGroups, overdueCount, overdueTasksRaw, completedLast7Days, activeMembers, onTimeStats] = await Promise.all([
      this.prisma.task.groupBy({ by: ['status'], where: { orgId }, _count: true }),
      this.prisma.task.count({ where: { orgId, status: { not: 'DONE' }, dueDate: { lt: now } } }),
      this.prisma.task.findMany({
        where: { orgId, status: { not: 'DONE' }, dueDate: { lt: now } },
        include: { assignee: true },
        orderBy: { dueDate: 'asc' },
        take: OVERDUE_PREVIEW_LIMIT,
      }),
      this.prisma.task.count({ where: { orgId, completedAt: { gte: sevenDaysAgo } } }),
      this.prisma.membership.findMany({ where: { orgId, status: 'ACTIVE' }, include: { user: true } }),
      this.prisma.task.findMany({
        where: { orgId, completedAt: { not: null }, dueDate: { not: null } },
        select: { completedAt: true, dueDate: true },
      }),
    ]);

    const statusCounts: Record<TaskStatusName, number> = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
    for (const group of statusGroups) {
      statusCounts[group.status as TaskStatusName] = group._count;
    }

    const onTimeCount = onTimeStats.filter((t) => t.completedAt! <= t.dueDate!).length;
    const onTimeRate = onTimeStats.length > 0 ? Math.round((onTimeCount / onTimeStats.length) * 100) : null;

    const memberWorkload = await Promise.all(
      activeMembers.map(async (m) => {
        const [openCount, memberOverdueCount, doneCount] = await Promise.all([
          this.prisma.task.count({ where: { orgId, assigneeId: m.userId, status: { in: ['TODO', 'IN_PROGRESS'] } } }),
          this.prisma.task.count({ where: { orgId, assigneeId: m.userId, status: { not: 'DONE' }, dueDate: { lt: now } } }),
          this.prisma.task.count({ where: { orgId, assigneeId: m.userId, status: 'DONE' } }),
        ]);
        return { userId: m.userId, name: m.user.name, openCount, overdueCount: memberOverdueCount, doneCount };
      }),
    );

    return {
      statusCounts,
      overdueCount,
      overdueTasks: overdueTasksRaw.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate!.toISOString(),
        priority: t.priority as TaskPriorityName,
        assigneeName: t.assignee?.name ?? null,
      })),
      completedLast7Days,
      onTimeRate,
      memberWorkload,
    };
  }
}
