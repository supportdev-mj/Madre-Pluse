import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type {
  CreateReopenRequestInput,
  DecideReopenRequestInput,
  ReopenRequestSummary,
  ReopenRequestStatusName,
} from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanModifyTask } from '../tasks/task-permissions';

interface ReopenRequestRecord {
  id: string;
  taskId: string;
  reason: string;
  status: string;
  requestedById: string;
  requestedBy: { name: string };
  reviewedById: string | null;
  reviewedBy: { name: string } | null;
  reviewNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

@Injectable()
export class ReopenRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly notifications: NotificationsService,
  ) {}

  async list(taskId: string): Promise<ReopenRequestSummary[]> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);

    const requests = await this.prisma.reopenRequest.findMany({
      where: { taskId },
      include: { requestedBy: true, reviewedBy: true },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => this.toSummary(r));
  }

  async create(taskId: string, input: CreateReopenRequestInput): Promise<ReopenRequestSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    assertCanModifyTask(this.cls, task);

    if (task.status !== 'DONE') {
      throw new BadRequestException('Only a completed task can have a reopen request');
    }

    const existingPending = await this.prisma.reopenRequest.findFirst({ where: { taskId, status: 'PENDING' } });
    if (existingPending) {
      throw new ConflictException('This task already has a pending reopen request');
    }

    const requestedById = this.currentUserId();
    const request = await this.prisma.reopenRequest.create({
      data: { taskId, requestedById, reason: input.reason },
      include: { requestedBy: true, reviewedBy: true },
    });

    const reviewers = await this.prisma.membership.findMany({
      where: { orgId, status: 'ACTIVE', role: { in: ['ADMIN', 'MANAGER'] } },
      select: { userId: true },
    });
    for (const { userId } of reviewers) {
      if (userId === requestedById) continue;
      await this.notifications.notify({
        orgId,
        userId,
        type: 'REOPEN_REQUESTED',
        message: `${request.requestedBy.name} requested to reopen "${task.title}"`,
        taskId,
      });
    }

    return this.toSummary(request);
  }

  async decide(taskId: string, requestId: string, input: DecideReopenRequestInput): Promise<ReopenRequestSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);

    const existing = await this.prisma.reopenRequest.findFirst({ where: { id: requestId, taskId } });
    if (!existing) throw new NotFoundException('Reopen request not found');
    if (existing.status !== 'PENDING') {
      throw new BadRequestException('This request has already been decided');
    }

    const reviewedById = this.currentUserId();
    const nextStatus = input.approve ? 'APPROVED' : 'REJECTED';

    const request = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.reopenRequest.update({
        where: { id: requestId },
        data: { status: nextStatus, reviewedById, reviewNote: input.reviewNote ?? null, reviewedAt: new Date() },
        include: { requestedBy: true, reviewedBy: true },
      });

      if (input.approve) {
        await tx.task.update({ where: { id: taskId }, data: { status: 'TODO', completedAt: null } });
        await tx.taskActivity.create({
          data: {
            taskId,
            actorId: reviewedById,
            type: 'STATUS_CHANGED',
            message: 'changed status from DONE to TODO (reopen approved)',
          },
        });
      }

      return updated;
    });

    await this.notifications.notify({
      orgId,
      userId: request.requestedById,
      type: input.approve ? 'REOPEN_APPROVED' : 'REOPEN_REJECTED',
      message: input.approve
        ? `Your request to reopen "${task.title}" was approved`
        : `Your request to reopen "${task.title}" was rejected`,
      taskId,
    });

    return this.toSummary(request);
  }

  private currentUserId(): string {
    const userId = this.cls.get('userId');
    if (!userId) throw new ForbiddenException();
    return userId;
  }

  private async getTaskOrThrow(taskId: string, orgId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, orgId } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private toSummary(r: ReopenRequestRecord): ReopenRequestSummary {
    return {
      id: r.id,
      taskId: r.taskId,
      reason: r.reason,
      status: r.status as ReopenRequestStatusName,
      requestedById: r.requestedById,
      requestedByName: r.requestedBy.name,
      reviewedById: r.reviewedById,
      reviewedByName: r.reviewedBy?.name ?? null,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    };
  }
}
