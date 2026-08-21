import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type { CreateProjectInput, ProjectStatusName, ProjectSummary, UpdateProjectInput } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { PrismaService } from '../prisma/prisma.service';

interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  status: string;
  clientId: string | null;
  client: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async list(): Promise<ProjectSummary[]> {
    const orgId = requireOrgId(this.cls);
    const projects = await this.prisma.project.findMany({
      where: { orgId },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
    return projects.map((p) => this.toSummary(p));
  }

  async create(input: CreateProjectInput): Promise<ProjectSummary> {
    const orgId = requireOrgId(this.cls);
    if (input.clientId) await this.assertClientInOrg(input.clientId, orgId);

    try {
      const project = await this.prisma.project.create({
        data: { orgId, name: input.name, description: input.description ?? null, clientId: input.clientId ?? null },
        include: { client: true },
      });
      return this.toSummary(project);
    } catch (err) {
      throw this.translateError(err);
    }
  }

  async update(id: string, input: UpdateProjectInput): Promise<ProjectSummary> {
    const orgId = requireOrgId(this.cls);
    const existing = await this.prisma.project.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Project not found');
    if (input.clientId) await this.assertClientInOrg(input.clientId, orgId);

    try {
      const project = await this.prisma.project.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          clientId: input.clientId,
          status: input.status,
        },
        include: { client: true },
      });
      return this.toSummary(project);
    } catch (err) {
      throw this.translateError(err);
    }
  }

  private async assertClientInOrg(clientId: string, orgId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, orgId } });
    if (!client) throw new BadRequestException('Client not found in this organization');
  }

  private translateError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('A project with this name already exists');
    }
    return err as Error;
  }

  private toSummary(p: ProjectRecord): ProjectSummary {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status as ProjectStatusName,
      clientId: p.clientId,
      clientName: p.client?.name ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
