import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type { ProductivityReport, ProductivityRow, ReportsQuery } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async getProductivity(query: ReportsQuery): Promise<ProductivityReport> {
    const orgId = requireOrgId(this.cls);

    const members = await this.prisma.membership.findMany({
      where: { orgId, status: 'ACTIVE' },
      include: { user: true },
    });

    const dateFilter: Prisma.DateTimeFilter | undefined =
      query.from || query.to
        ? { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) }
        : undefined;

    const rows: ProductivityRow[] = await Promise.all(
      members.map(async (m): Promise<ProductivityRow> => {
        const completedTasks = await this.prisma.task.findMany({
          where: {
            orgId,
            assignments: { some: { userId: m.userId } },
            status: 'DONE',
            ...(dateFilter ? { completedAt: dateFilter } : {}),
          },
          select: { id: true, completedAt: true, dueDate: true },
        });

        const completedCount = completedTasks.length;
        const withDueDate = completedTasks.filter((t) => t.dueDate);
        const onTimeCount = withDueDate.filter((t) => t.completedAt! <= t.dueDate!).length;
        const onTimeRate = withDueDate.length > 0 ? Math.round((onTimeCount / withDueDate.length) * 100) : null;

        const periodTimeAgg = await this.prisma.timeEntry.aggregate({
          where: {
            userId: m.userId,
            task: { orgId },
            ...(dateFilter ? { date: dateFilter } : {}),
          },
          _sum: { minutes: true },
        });
        const totalMinutes = periodTimeAgg._sum.minutes ?? 0;

        let avgMinutesPerTask: number | null = null;
        if (completedCount > 0) {
          const completedTimeAgg = await this.prisma.timeEntry.aggregate({
            where: { taskId: { in: completedTasks.map((t) => t.id) } },
            _sum: { minutes: true },
          });
          avgMinutesPerTask = Math.round((completedTimeAgg._sum.minutes ?? 0) / completedCount);
        }

        return {
          userId: m.userId,
          name: m.user.name,
          completedCount,
          onTimeRate,
          totalMinutes,
          avgMinutesPerTask,
        };
      }),
    );

    return {
      from: query.from ? query.from.toISOString() : null,
      to: query.to ? query.to.toISOString() : null,
      rows,
    };
  }

  async getProductivityCsv(query: ReportsQuery): Promise<string> {
    const report = await this.getProductivity(query);
    return this.buildCsv(report);
  }

  private buildCsv(report: ProductivityReport): string {
    const header = ['Name', 'Completed', 'On-time rate (%)', 'Total time (minutes)', 'Avg time per task (minutes)'];
    const lines = [header.map(csvField).join(',')];
    for (const row of report.rows) {
      lines.push(
        [row.name, row.completedCount, row.onTimeRate ?? '', row.totalMinutes, row.avgMinutesPerTask ?? '']
          .map(csvField)
          .join(','),
      );
    }
    return lines.join('\r\n');
  }
}

function csvField(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
