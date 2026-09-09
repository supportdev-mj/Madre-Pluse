import { ForbiddenException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { DashboardSummary, TaskPriorityName, TaskStatusName } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { getDirectReportUserIds, getTaskVisibleUserIds, taskVisibilityWhere } from '../common/tenant/task-visibility';
import { PrismaService } from '../prisma/prisma.service';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const OVERDUE_PREVIEW_LIMIT = 10;
const RECENT_ACTIVITY_LIMIT = 8;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async getSummary(): Promise<DashboardSummary> {
    const orgId = requireOrgId(this.cls);
    // Available to admins and managers, and — since visibility is hierarchy-based, not role-based
    // (see getTaskVisibleUserIds) — anyone else who actually has direct reports.
    const role = this.cls.get('role');
    if (role !== 'ADMIN' && role !== 'MANAGER') {
      const reportIds = await getDirectReportUserIds(this.prisma, this.cls, orgId);
      if (reportIds.length === 0) {
        throw new ForbiddenException('The dashboard is only available to admins, managers, or anyone with direct reports');
      }
    }
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS);
    const visibleUserIds = await getTaskVisibleUserIds(this.prisma, this.cls, orgId);
    const taskWhere = taskVisibilityWhere(visibleUserIds);

    const [statusGroups, priorityGroups, overdueCount, overdueTasksRaw, completedLast7Days, activeMembers, onTimeStats, recentActivityRaw] =
      await Promise.all([
        this.prisma.task.groupBy({ by: ['status'], where: { orgId, ...taskWhere }, _count: true }),
        this.prisma.task.groupBy({ by: ['priority'], where: { orgId, ...taskWhere }, _count: true }),
        this.prisma.task.count({ where: { orgId, status: { not: 'DONE' }, dueDate: { lt: now }, ...taskWhere } }),
        this.prisma.task.findMany({
          where: { orgId, status: { not: 'DONE' }, dueDate: { lt: now }, ...taskWhere },
          include: { assignments: { include: { user: true } } },
          orderBy: { dueDate: 'asc' },
          take: OVERDUE_PREVIEW_LIMIT,
        }),
        this.prisma.task.count({ where: { orgId, completedAt: { gte: sevenDaysAgo }, ...taskWhere } }),
        this.prisma.membership.findMany({
          where: { orgId, status: 'ACTIVE', ...(visibleUserIds ? { userId: { in: visibleUserIds } } : {}) },
          include: { user: true },
        }),
        this.prisma.task.findMany({
          where: { orgId, completedAt: { not: null }, dueDate: { not: null }, ...taskWhere },
          select: { completedAt: true, dueDate: true },
        }),
        this.prisma.taskActivity.findMany({
          where: { task: { orgId, ...taskWhere } },
          include: { actor: true, task: { select: { title: true } } },
          orderBy: { createdAt: 'desc' },
          take: RECENT_ACTIVITY_LIMIT,
        }),
      ]);

    const statusCounts: Record<TaskStatusName, number> = { TODO: 0, IN_PROGRESS: 0, TO_VERIFY: 0, FAILED: 0, DONE: 0 };
    for (const group of statusGroups) {
      statusCounts[group.status as TaskStatusName] = group._count;
    }

    const priorityCounts: Record<TaskPriorityName, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 };
    for (const group of priorityGroups) {
      priorityCounts[group.priority as TaskPriorityName] = group._count;
    }

    const onTimeCount = onTimeStats.filter((t) => t.completedAt! <= t.dueDate!).length;
    const onTimeRate = onTimeStats.length > 0 ? Math.round((onTimeCount / onTimeStats.length) * 100) : null;

    const memberWorkload = await Promise.all(
      activeMembers.map(async (m) => {
        const assignedToMember = { some: { userId: m.userId } };
        const [openCount, memberOverdueCount, doneCount] = await Promise.all([
          this.prisma.task.count({ where: { orgId, assignments: assignedToMember, status: { in: ['TODO', 'IN_PROGRESS'] } } }),
          this.prisma.task.count({ where: { orgId, assignments: assignedToMember, status: { not: 'DONE' }, dueDate: { lt: now } } }),
          this.prisma.task.count({ where: { orgId, assignments: assignedToMember, status: 'DONE' } }),
        ]);
        return { userId: m.userId, name: m.user.name, openCount, overdueCount: memberOverdueCount, doneCount };
      }),
    );

    return {
      statusCounts,
      priorityCounts,
      overdueCount,
      overdueTasks: overdueTasksRaw.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate!.toISOString(),
        priority: t.priority as TaskPriorityName,
        assigneeNames: t.assignments.map((a) => a.user.name),
      })),
      completedLast7Days,
      onTimeRate,
      memberWorkload,
      recentActivity: recentActivityRaw.map((a) => ({
        id: a.id,
        actorName: a.actor.name,
        taskTitle: a.task.title,
        message: a.message,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }
}
