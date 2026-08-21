import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { CommentSummary, CreateCommentInput } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

interface CommentRecord {
  id: string;
  taskId: string;
  authorId: string;
  author: { name: string; initials: string; avatarColor: string };
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly notifications: NotificationsService,
  ) {}

  async list(taskId: string): Promise<CommentSummary[]> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);

    const comments = await this.prisma.comment.findMany({
      where: { taskId },
      include: { author: true },
      orderBy: { createdAt: 'asc' },
    });
    return comments.map((c) => this.toSummary(c));
  }

  async create(taskId: string, input: CreateCommentInput): Promise<CommentSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    const authorId = this.currentUserId();

    const comment = await this.prisma.comment.create({
      data: { taskId, authorId, body: input.body },
      include: { author: true },
    });

    const recipients = new Set([task.assigneeId, task.createdById].filter((id): id is string => !!id && id !== authorId));
    for (const recipientId of recipients) {
      await this.notifications.notify({
        orgId,
        userId: recipientId,
        type: 'NEW_COMMENT',
        message: `${comment.author.name} commented on "${task.title}"`,
        taskId,
      });
    }

    return this.toSummary(comment);
  }

  async remove(taskId: string, commentId: string): Promise<void> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);

    const existing = await this.prisma.comment.findFirst({ where: { id: commentId, taskId } });
    if (!existing) throw new NotFoundException('Comment not found');

    const role = this.cls.get('role');
    const userId = this.cls.get('userId');
    if (role !== 'ADMIN' && role !== 'MANAGER' && existing.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    await this.prisma.comment.delete({ where: { id: commentId } });
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

  private toSummary(c: CommentRecord): CommentSummary {
    return {
      id: c.id,
      taskId: c.taskId,
      authorId: c.authorId,
      authorName: c.author.name,
      authorInitials: c.author.initials,
      authorAvatarColor: c.author.avatarColor,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
