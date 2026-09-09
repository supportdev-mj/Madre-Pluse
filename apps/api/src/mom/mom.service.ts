import { randomBytes } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import type {
  ListMomCandidatesQuery,
  MomAiSettingsStatus,
  MomCandidateStatusName,
  MomTaskCandidateSummary,
  MomUploadResult,
  TaskPriorityName,
  UpdateMomAiSettingsInput,
  UpdateMomCandidateInput,
} from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { decryptSecret, encryptSecret } from '../common/utils/encryption';
import type { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TasksService } from '../tasks/tasks.service';
import { MomExtractionService, type ExtractedMomItem } from './mom-extraction.service';

const DEFAULT_MODEL = 'claude-sonnet-5';

interface CandidateRecord {
  id: string;
  momUploadId: string;
  momUpload: { fileName: string };
  title: string;
  description: string;
  suggestedAssigneeName: string | null;
  suggestedAssigneeIds: string[];
  dueDate: Date | null;
  priority: string;
  context: string | null;
  status: string;
  createdTaskId: string | null;
  reviewedById: string | null;
  reviewedBy: { name: string } | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CANDIDATE_INCLUDE = {
  momUpload: { select: { fileName: true } },
  reviewedBy: { select: { name: true } },
} as const;

@Injectable()
export class MomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly config: ConfigService<Env, true>,
    private readonly storage: StorageService,
    private readonly extraction: MomExtractionService,
    private readonly tasksService: TasksService,
  ) {}

  async getSettings(): Promise<MomAiSettingsStatus> {
    const orgId = requireOrgId(this.cls);
    const settings = await this.prisma.orgAiSettings.findUnique({ where: { orgId } });
    return {
      configured: !!settings,
      model: settings?.model ?? null,
      updatedAt: settings?.updatedAt.toISOString() ?? null,
    };
  }

  async updateSettings(input: UpdateMomAiSettingsInput): Promise<MomAiSettingsStatus> {
    const orgId = requireOrgId(this.cls);
    const updatedById = this.currentUserId();
    const encryptionKey = this.config.get('TOKEN_ENCRYPTION_KEY', { infer: true });
    const apiKeyEncrypted = encryptSecret(input.apiKey, encryptionKey);

    const settings = await this.prisma.orgAiSettings.upsert({
      where: { orgId },
      create: { orgId, apiKeyEncrypted, model: input.model ?? DEFAULT_MODEL, updatedById },
      update: { apiKeyEncrypted, model: input.model ?? DEFAULT_MODEL, updatedById },
    });

    return { configured: true, model: settings.model, updatedAt: settings.updatedAt.toISOString() };
  }

  async upload(file: Express.Multer.File): Promise<MomUploadResult> {
    const orgId = requireOrgId(this.cls);
    const uploadedById = this.currentUserId();

    const settings = await this.prisma.orgAiSettings.findUnique({ where: { orgId } });
    if (!settings) {
      throw new BadRequestException(
        'AI extraction is not configured for this organization yet. Ask an admin to add an API key in Settings.',
      );
    }
    const encryptionKey = this.config.get('TOKEN_ENCRYPTION_KEY', { infer: true });
    const apiKey = decryptSecret(settings.apiKeyEncrypted, encryptionKey);

    const extracted = await this.extraction.extract(file.buffer.toString('base64'), apiKey, settings.model);

    const { unique, skipped } = await this.dedupe(orgId, extracted);
    const resolved = await this.resolveAssignees(orgId, unique);

    const key = `${orgId}/mom/${randomBytes(8).toString('hex')}-${this.sanitizeFileName(file.originalname)}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    const candidates = await this.prisma.$transaction(async (tx) => {
      const upload = await tx.momUpload.create({
        data: {
          orgId,
          uploadedById,
          fileName: file.originalname,
          storageKey: key,
          sizeBytes: file.size,
          itemsFound: extracted.length,
          itemsNew: resolved.length,
        },
      });

      const created: CandidateRecord[] = [];
      for (const item of resolved) {
        const candidate = await tx.momTaskCandidate.create({
          data: {
            orgId,
            momUploadId: upload.id,
            title: item.title,
            description: item.description || item.title,
            suggestedAssigneeName: item.responsibleName || null,
            suggestedAssigneeIds: item.assigneeId ? [item.assigneeId] : [],
            dueDate: item.dueDate,
            priority: item.priority,
            context: item.context || null,
          },
          include: CANDIDATE_INCLUDE,
        });
        created.push(candidate);
      }
      return created;
    });

    return {
      itemsFound: extracted.length,
      itemsNew: candidates.length,
      itemsSkipped: skipped,
      candidates: candidates.map((c) => this.toSummary(c)),
    };
  }

  /** Admin-only, for now: removes an uploaded MOM file and its still-queued candidates. Any
   * candidate already accepted into a real task is unaffected — only the suggestion record and
   * its link back to this upload go away, never the task itself. */
  async removeUpload(id: string): Promise<void> {
    const orgId = requireOrgId(this.cls);
    const upload = await this.prisma.momUpload.findFirst({ where: { id, orgId } });
    if (!upload) throw new NotFoundException('Upload not found');
    await this.storage.delete(upload.storageKey);
    await this.prisma.momUpload.delete({ where: { id } });
  }

  async listCandidates(query: ListMomCandidatesQuery): Promise<MomTaskCandidateSummary[]> {
    const orgId = requireOrgId(this.cls);
    const isManagerOrAdmin = this.isManagerOrAdmin();
    const candidates = await this.prisma.momTaskCandidate.findMany({
      where: {
        orgId,
        status: query.status ?? 'PENDING',
        ...(isManagerOrAdmin ? {} : { suggestedAssigneeIds: { has: this.currentUserId() } }),
      },
      include: CANDIDATE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return candidates.map((c) => this.toSummary(c));
  }

  async updateCandidate(id: string, input: UpdateMomCandidateInput): Promise<MomTaskCandidateSummary> {
    const orgId = requireOrgId(this.cls);
    const existing = await this.prisma.momTaskCandidate.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Queued item not found');
    this.assertCanReview(existing);
    if (existing.status !== 'PENDING') {
      throw new BadRequestException('This item has already been reviewed and can no longer be edited');
    }

    if (input.assigneeIds) {
      for (const userId of input.assigneeIds) await this.assertActiveMemberOfOrg(userId, orgId);
    }

    const updated = await this.prisma.momTaskCandidate.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        suggestedAssigneeIds: input.assigneeIds,
        priority: input.priority,
      },
      include: CANDIDATE_INCLUDE,
    });
    return this.toSummary(updated);
  }

  async acceptCandidate(id: string): Promise<MomTaskCandidateSummary> {
    const orgId = requireOrgId(this.cls);
    const reviewerId = this.currentUserId();
    const existing = await this.prisma.momTaskCandidate.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Queued item not found');
    this.assertCanReview(existing);
    if (existing.status !== 'PENDING') {
      throw new BadRequestException('This item has already been reviewed');
    }
    if (!existing.title || !existing.description || !existing.dueDate || existing.suggestedAssigneeIds.length === 0) {
      throw new BadRequestException(
        'Complete the title, description, due date and assignee(s) (via Edit) before accepting.',
      );
    }

    const task = await this.tasksService.create({
      title: existing.title,
      description: existing.description,
      dueDate: existing.dueDate,
      priority: existing.priority as TaskPriorityName,
      assigneeIds: existing.suggestedAssigneeIds,
    });

    const updated = await this.prisma.momTaskCandidate.update({
      where: { id },
      data: { status: 'ACCEPTED', createdTaskId: task.id, reviewedById: reviewerId, reviewedAt: new Date() },
      include: CANDIDATE_INCLUDE,
    });
    return this.toSummary(updated);
  }

  async rejectCandidate(id: string): Promise<MomTaskCandidateSummary> {
    const orgId = requireOrgId(this.cls);
    const reviewerId = this.currentUserId();
    const existing = await this.prisma.momTaskCandidate.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Queued item not found');
    this.assertCanReview(existing);
    if (existing.status !== 'PENDING') {
      throw new BadRequestException('This item has already been reviewed');
    }

    const updated = await this.prisma.momTaskCandidate.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date() },
      include: CANDIDATE_INCLUDE,
    });
    return this.toSummary(updated);
  }

  /** Skips items whose normalized title matches an already-queued (PENDING) candidate or an existing task in this org. */
  private async dedupe(
    orgId: string,
    items: ExtractedMomItem[],
  ): Promise<{ unique: ExtractedMomItem[]; skipped: number }> {
    const [candidates, tasks] = await Promise.all([
      this.prisma.momTaskCandidate.findMany({ where: { orgId, status: 'PENDING' }, select: { title: true } }),
      this.prisma.task.findMany({ where: { orgId }, select: { title: true } }),
    ]);
    const seen = new Set([...candidates, ...tasks].map((t) => this.normalize(t.title)));

    const unique: ExtractedMomItem[] = [];
    for (const item of items) {
      const key = this.normalize(item.title);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return { unique, skipped: items.length - unique.length };
  }

  private async resolveAssignees(
    orgId: string,
    items: ExtractedMomItem[],
  ): Promise<Array<Omit<ExtractedMomItem, 'dueDate'> & { assigneeId: string | null; dueDate: Date | null }>> {
    const members = await this.prisma.membership.findMany({
      where: { orgId, status: 'ACTIVE' },
      include: { user: { select: { id: true, name: true } } },
    });

    return items.map((item) => ({
      ...item,
      assigneeId: this.matchAssignee(item.responsibleName, members.map((m) => m.user)),
      dueDate: this.parseDueDate(item.dueDate),
    }));
  }

  private matchAssignee(responsibleName: string, users: Array<{ id: string; name: string }>): string | null {
    const target = this.normalize(responsibleName);
    if (!target) return null;

    const matches = users.filter((u) => {
      const name = this.normalize(u.name);
      return name === target || name.includes(target) || target.includes(name);
    });
    return matches.length === 1 ? matches[0].id : null;
  }

  private parseDueDate(value: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
  }

  private currentUserId(): string {
    const userId = this.cls.get('userId');
    if (!userId) throw new ForbiddenException();
    return userId;
  }

  private isManagerOrAdmin(): boolean {
    const role = this.cls.get('role');
    return role === 'ADMIN' || role === 'MANAGER';
  }

  /** ADMIN/MANAGER may review any candidate; anyone else only one they're among the suggested assignees for. */
  private assertCanReview(candidate: { suggestedAssigneeIds: string[] }): void {
    if (this.isManagerOrAdmin()) return;
    if (candidate.suggestedAssigneeIds.includes(this.currentUserId())) return;
    throw new ForbiddenException('You can only act on MOM items assigned to you');
  }

  private async assertActiveMemberOfOrg(userId: string, orgId: string): Promise<void> {
    const membership = await this.prisma.membership.findFirst({ where: { userId, orgId, status: 'ACTIVE' } });
    if (!membership) throw new BadRequestException('Assignee is not an active member of this organization');
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  }

  private toSummary(c: CandidateRecord): MomTaskCandidateSummary {
    return {
      id: c.id,
      momUploadId: c.momUploadId,
      momUploadFileName: c.momUpload.fileName,
      title: c.title,
      description: c.description,
      suggestedAssigneeName: c.suggestedAssigneeName,
      suggestedAssigneeIds: c.suggestedAssigneeIds,
      dueDate: c.dueDate ? c.dueDate.toISOString() : null,
      priority: c.priority as TaskPriorityName,
      context: c.context,
      status: c.status as MomCandidateStatusName,
      createdTaskId: c.createdTaskId,
      reviewedById: c.reviewedById,
      reviewedByName: c.reviewedBy?.name ?? null,
      reviewedAt: c.reviewedAt ? c.reviewedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
