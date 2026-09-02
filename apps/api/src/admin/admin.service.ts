import { Injectable, NotFoundException } from '@nestjs/common';
import type { AdminOrganizationSummary, OrganizationPlanName, OrganizationStatusName, UpdateOrganizationAdminInput } from '@madre-pulse/shared';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
}
