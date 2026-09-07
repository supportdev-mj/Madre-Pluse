import { randomBytes } from 'crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { AttachmentSummary } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { getTaskVisibleUserIds, taskVisibilityWhere } from '../common/tenant/task-visibility';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

interface AttachmentRecord {
  id: string;
  taskId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  uploadedBy: { name: string };
  createdAt: Date;
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly storage: StorageService,
  ) {}

  async list(taskId: string): Promise<AttachmentSummary[]> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);

    const attachments = await this.prisma.attachment.findMany({
      where: { taskId },
      include: { uploadedBy: true },
      orderBy: { createdAt: 'desc' },
    });
    return attachments.map((a) => this.toSummary(a));
  }

  async upload(taskId: string, file: Express.Multer.File): Promise<AttachmentSummary> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);
    const uploadedById = this.currentUserId();

    const key = `${orgId}/${taskId}/${randomBytes(8).toString('hex')}-${this.sanitizeFileName(file.originalname)}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    const attachment = await this.prisma.attachment.create({
      data: {
        taskId,
        uploadedById,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: key,
      },
      include: { uploadedBy: true },
    });
    return this.toSummary(attachment);
  }

  async getDownloadUrl(taskId: string, attachmentId: string): Promise<{ url: string }> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);

    const attachment = await this.prisma.attachment.findFirst({ where: { id: attachmentId, taskId } });
    if (!attachment) throw new NotFoundException('Attachment not found');

    const url = await this.storage.getDownloadUrl(attachment.storageKey, attachment.fileName);
    return { url };
  }

  async remove(taskId: string, attachmentId: string): Promise<void> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);

    const attachment = await this.prisma.attachment.findFirst({ where: { id: attachmentId, taskId } });
    if (!attachment) throw new NotFoundException('Attachment not found');

    const role = this.cls.get('role');
    const userId = this.cls.get('userId');
    if (role !== 'ADMIN' && role !== 'MANAGER' && attachment.uploadedById !== userId) {
      throw new ForbiddenException('You can only delete attachments you uploaded');
    }

    await this.storage.delete(attachment.storageKey);
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
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
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  }

  private toSummary(a: AttachmentRecord): AttachmentSummary {
    return {
      id: a.id,
      taskId: a.taskId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadedById: a.uploadedById,
      uploadedByName: a.uploadedBy.name,
      createdAt: a.createdAt.toISOString(),
    };
  }
}
