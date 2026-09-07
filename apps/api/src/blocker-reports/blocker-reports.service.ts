import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type {
  BlockerReportStatusName,
  BlockerReportSummary,
  CreateBlockerReportInput,
  ResolveBlockerReportInput,
} from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { getTaskVisibleUserIds, taskVisibilityWhere } from '../common/tenant/task-visibility';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanModifyTask } from '../tasks/task-permissions';

interface BlockerReportRecord {
  id: string;
  taskId: string;
  reason: string;
  status: string;
  reportedById: string;
  reportedBy: { name: string };
  resolvedById: string | null;
  resolvedBy: { name: string } | null;
  resolutionNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

@Injectable()
export class BlockerReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly notifications: NotificationsService,
  ) {}

  async list(taskId: string): Promise<BlockerReportSummary[]> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);

    const reports = await this.prisma.blockerReport.findMany({
      where: { taskId },
      include: { reportedBy: true, resolvedBy: true },
      orderBy: { createdAt: 'desc' },
    });
    return reports.map((r) => this.toSummary(r));
  }

  async create(taskId: string, input: CreateBlockerReportInput): Promise<BlockerReportSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    assertCanModifyTask(this.cls, { assigneeIds: task.assignments.map((a) => a.userId), createdById: task.createdById });

    const reportedById = this.currentUserId();
    const report = await this.prisma.blockerReport.create({
      data: { taskId, reportedById, reason: input.reason },
      include: { reportedBy: true, resolvedBy: true },
    });

    const reviewers = await this.prisma.membership.findMany({
      where: { orgId, status: 'ACTIVE', role: { in: ['ADMIN', 'MANAGER'] } },
      select: { userId: true },
    });
    for (const { userId } of reviewers) {
      if (userId === reportedById) continue;
      await this.notifications.notify({
        orgId,
        userId,
        type: 'BLOCKER_REPORTED',
        message: `${report.reportedBy.name} reported a blocker on "${task.title}"`,
        taskId,
      });
    }

    return this.toSummary(report);
  }

  async resolve(taskId: string, reportId: string, input: ResolveBlockerReportInput): Promise<BlockerReportSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);

    const existing = await this.prisma.blockerReport.findFirst({ where: { id: reportId, taskId } });
    if (!existing) throw new NotFoundException('Blocker report not found');
    if (existing.status !== 'OPEN') {
      throw new BadRequestException('This blocker report has already been resolved');
    }

    const resolvedById = this.currentUserId();
    const report = await this.prisma.blockerReport.update({
      where: { id: reportId },
      data: { status: 'RESOLVED', resolvedById, resolutionNote: input.resolutionNote ?? null, resolvedAt: new Date() },
      include: { reportedBy: true, resolvedBy: true },
    });

    if (report.reportedById !== resolvedById) {
      await this.notifications.notify({
        orgId,
        userId: report.reportedById,
        type: 'BLOCKER_RESOLVED',
        message: `Your reported blocker on "${task.title}" was resolved`,
        taskId,
      });
    }

    return this.toSummary(report);
  }

  private currentUserId(): string {
    const userId = this.cls.get('userId');
    if (!userId) throw new ForbiddenException();
    return userId;
  }

  private async getTaskOrThrow(taskId: string, orgId: string) {
    const visibleUserIds = await getTaskVisibleUserIds(this.prisma, this.cls, orgId);
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, orgId, ...taskVisibilityWhere(visibleUserIds) },
      include: { assignments: { select: { userId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private toSummary(r: BlockerReportRecord): BlockerReportSummary {
    return {
      id: r.id,
      taskId: r.taskId,
      reason: r.reason,
      status: r.status as BlockerReportStatusName,
      reportedById: r.reportedById,
      reportedByName: r.reportedBy.name,
      resolvedById: r.resolvedById,
      resolvedByName: r.resolvedBy?.name ?? null,
      resolutionNote: r.resolutionNote,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    };
  }
}
