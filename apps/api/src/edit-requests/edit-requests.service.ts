import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type {
  CreateEditRequestInput,
  EditRequestStatusName,
  EditRequestSummary,
  ResolveEditRequestInput,
} from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { getTaskVisibleUserIds, taskVisibilityWhere } from '../common/tenant/task-visibility';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanEditTask, assertCanModifyTask } from '../tasks/task-permissions';

interface EditRequestRecord {
  id: string;
  taskId: string;
  reason: string;
  status: string;
  requestedById: string;
  requestedBy: { name: string };
  resolvedById: string | null;
  resolvedBy: { name: string } | null;
  resolutionNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

@Injectable()
export class EditRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly notifications: NotificationsService,
  ) {}

  async list(taskId: string): Promise<EditRequestSummary[]> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);

    const requests = await this.prisma.editRequest.findMany({
      where: { taskId },
      include: { requestedBy: true, resolvedBy: true },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => this.toSummary(r));
  }

  async create(taskId: string, input: CreateEditRequestInput): Promise<EditRequestSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    assertCanModifyTask(this.cls, { assigneeIds: task.assignments.map((a) => a.userId), createdById: task.createdById });

    const requestedById = this.currentUserId();
    const request = await this.prisma.editRequest.create({
      data: { taskId, requestedById, reason: input.reason },
      include: { requestedBy: true, resolvedBy: true },
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
        type: 'EDIT_REQUESTED',
        message: `${request.requestedBy.name} requested an edit on "${task.title}"`,
        taskId,
      });
    }

    return this.toSummary(request);
  }

  async resolve(taskId: string, requestId: string, input: ResolveEditRequestInput): Promise<EditRequestSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    // Resolving implies "I made the edit" — so it takes the same precise admin/manager-of-an-
    // assignee check as actually editing the task, not just the coarser ADMIN/MANAGER role guard
    // on the route (which would otherwise let a manager resolve a request on an unrelated task).
    await assertCanEditTask(this.prisma, this.cls, orgId, task.assignments.map((a) => a.userId));

    const existing = await this.prisma.editRequest.findFirst({ where: { id: requestId, taskId } });
    if (!existing) throw new NotFoundException('Edit request not found');
    if (existing.status !== 'OPEN') {
      throw new BadRequestException('This edit request has already been resolved');
    }

    const resolvedById = this.currentUserId();
    const request = await this.prisma.editRequest.update({
      where: { id: requestId },
      data: { status: 'RESOLVED', resolvedById, resolutionNote: input.resolutionNote ?? null, resolvedAt: new Date() },
      include: { requestedBy: true, resolvedBy: true },
    });

    if (request.requestedById !== resolvedById) {
      await this.notifications.notify({
        orgId,
        userId: request.requestedById,
        type: 'EDIT_REQUEST_RESOLVED',
        message: `Your edit request on "${task.title}" was resolved`,
        taskId,
      });
    }

    return this.toSummary(request);
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

  private toSummary(r: EditRequestRecord): EditRequestSummary {
    return {
      id: r.id,
      taskId: r.taskId,
      reason: r.reason,
      status: r.status as EditRequestStatusName,
      requestedById: r.requestedById,
      requestedByName: r.requestedBy.name,
      resolvedById: r.resolvedById,
      resolvedByName: r.resolvedBy?.name ?? null,
      resolutionNote: r.resolutionNote,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    };
  }
}
