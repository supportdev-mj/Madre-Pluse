import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AdminOrganizationSummary,
  LlmSettingsStatus,
  OrganizationPlanName,
  OrganizationStatusName,
  UpdateOrganizationAdminInput,
  UpdateLlmSettingsInput,
} from '@madre-pulse/shared';
import { encryptSecret } from '../common/utils/encryption';
import type { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

const LLM_SETTINGS_ID = 'default';

interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: Date;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Deliberately org-unscoped — this is the platform-admin surface, the one place in the app
   * that's meant to see across every tenant. Gated entirely by SuperAdminGuard at the controller,
   * not by requireOrgId/CLS. Returns account/plan metadata only, never a tenant's actual task
   * data — that boundary stays intact everywhere else in the app.
   */
  async listOrganizations(): Promise<AdminOrganizationSummary[]> {
    const [orgs, counts] = await Promise.all([
      this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.membership.groupBy({ by: ['orgId'], where: { status: 'ACTIVE' }, _count: true }),
    ]);
    const countByOrgId = new Map(counts.map((c) => [c.orgId, c._count]));
    return orgs.map((org) => this.toSummary(org, countByOrgId.get(org.id) ?? 0));
  }

  async updateOrganization(id: string, input: UpdateOrganizationAdminInput): Promise<AdminOrganizationSummary> {
    const existing = await this.prisma.organization.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Organization not found');

    const updated = await this.prisma.organization.update({
      where: { id },
      data: { plan: input.plan, status: input.status },
    });
    const memberCount = await this.prisma.membership.count({ where: { orgId: id, status: 'ACTIVE' } });
    return this.toSummary(updated, memberCount);
  }

  private toSummary(org: OrganizationRecord, memberCount: number): AdminOrganizationSummary {
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan as OrganizationPlanName,
      status: org.status as OrganizationStatusName,
      memberCount,
      createdAt: org.createdAt.toISOString(),
    };
  }

  /** Never returns the API key itself — only whether one is configured, and which model it's set to use. */
  async getLlmSettings(): Promise<LlmSettingsStatus> {
    const settings = await this.prisma.llmSettings.findUnique({ where: { id: LLM_SETTINGS_ID } });
    return {
      configured: !!settings,
      model: settings?.model ?? null,
      updatedAt: settings?.updatedAt.toISOString() ?? null,
    };
  }

  async updateLlmSettings(input: UpdateLlmSettingsInput, updatedById: string): Promise<LlmSettingsStatus> {
    const encryptionKey = this.config.get('TOKEN_ENCRYPTION_KEY', { infer: true });
    const apiKeyEncrypted = encryptSecret(input.apiKey, encryptionKey);

    const settings = await this.prisma.llmSettings.upsert({
      where: { id: LLM_SETTINGS_ID },
      create: { id: LLM_SETTINGS_ID, apiKeyEncrypted, model: input.model, updatedById },
      update: { apiKeyEncrypted, model: input.model, updatedById },
    });

    return { configured: true, model: settings.model, updatedAt: settings.updatedAt.toISOString() };
  }
}
