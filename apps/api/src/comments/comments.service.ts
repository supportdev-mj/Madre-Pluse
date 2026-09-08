import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { AttachmentSummary, CommentSummary, CreateCommentInput } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { getTaskVisibleUserIds, taskVisibilityWhere } from '../common/tenant/task-visibility';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

interface CommentRecord {
  id: string;
  taskId: string;
  authorId: string;
  author: { name: string; initials: string; avatarColor: string };
  body: string | null;
  attachments: {
    id: string;
    taskId: string;
    commentId: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedById: string;
    uploadedBy: { name: string };
    createdAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const COMMENT_INCLUDE = { author: true, attachments: { include: { uploadedBy: true } } } as const;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  async list(taskId: string): Promise<CommentSummary[]> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);

    const comments = await this.prisma.comment.findMany({
      where: { taskId },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return comments.map((c) => this.toSummary(c));
  }

  /** body may be empty — a chat message can be file/voice-note-only. The caller (frontend) is
   * responsible for not sending a message with neither text nor a follow-up attachment upload. */
  async create(taskId: string, input: CreateCommentInput): Promise<CommentSummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    const authorId = this.currentUserId();

    const comment = await this.prisma.comment.create({
      data: { taskId, authorId, body: input.body?.trim() || null },
      include: COMMENT_INCLUDE,
    });

    const recipients = new Set(
      [...task.assignments.map((a) => a.userId), task.createdById].filter((id) => id !== authorId),
    );
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

    const existing = await this.prisma.comment.findFirst({
      where: { id: commentId, taskId },
      include: { attachments: true },
    });
    if (!existing) throw new NotFoundException('Comment not found');

    const role = this.cls.get('role');
    const userId = this.cls.get('userId');
    // Anyone can delete their own message within a short window after sending it (to fix a typo,
    // pull back a wrong attachment); past that, only an admin can remove it.
    const isOwnAndRecent = existing.authorId === userId && Date.now() - existing.createdAt.getTime() < 10_000;
    if (role !== 'ADMIN' && !isOwnAndRecent) {
      throw new ForbiddenException('You can only delete your own messages within 10 seconds of sending them');
    }

    // Attachment rows cascade-delete with the comment; clean up their S3 objects first so nothing
    // orphaned is left behind in storage.
    for (const attachment of existing.attachments) {
      await this.storage.delete(attachment.storageKey);
    }
    await this.prisma.comment.delete({ where: { id: commentId } });
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

  private toAttachmentSummary(a: CommentRecord['attachments'][number]): AttachmentSummary {
    return {
      id: a.id,
      taskId: a.taskId,
      commentId: a.commentId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadedById: a.uploadedById,
      uploadedByName: a.uploadedBy.name,
      createdAt: a.createdAt.toISOString(),
    };
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
      attachments: c.attachments.map((a) => this.toAttachmentSummary(a)),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
