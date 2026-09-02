import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { OrganizationPlanName, OrganizationStatusName, OrganizationSummary, UpdateOrganizationInput } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
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
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async get(): Promise<OrganizationSummary> {
    const orgId = requireOrgId(this.cls);
    const org = await this.getOrgOrThrow(orgId);
    return this.toSummary(org);
  }

  async update(input: UpdateOrganizationInput): Promise<OrganizationSummary> {
    const orgId = requireOrgId(this.cls);
    await this.getOrgOrThrow(orgId);
    const updated = await this.prisma.organization.update({ where: { id: orgId }, data: { name: input.name } });
    return this.toSummary(updated);
  }

  private async getOrgOrThrow(orgId: string): Promise<OrganizationRecord> {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  private async toSummary(org: OrganizationRecord): Promise<OrganizationSummary> {
    const memberCount = await this.prisma.membership.count({ where: { orgId: org.id, status: 'ACTIVE' } });
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
