import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type { ClientSummary, CreateClientInput, UpdateClientInput } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { PrismaService } from '../prisma/prisma.service';

interface ClientRecord {
  id: string;
  name: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async list(): Promise<ClientSummary[]> {
    const orgId = requireOrgId(this.cls);
    const clients = await this.prisma.client.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
    return clients.map((c) => this.toSummary(c));
  }

  async create(input: CreateClientInput): Promise<ClientSummary> {
    const orgId = requireOrgId(this.cls);
    try {
      const client = await this.prisma.client.create({
        data: { orgId, name: input.name, notes: input.notes ?? null },
      });
      return this.toSummary(client);
    } catch (err) {
      throw this.translateError(err);
    }
  }

  async update(id: string, input: UpdateClientInput): Promise<ClientSummary> {
    const orgId = requireOrgId(this.cls);
    const existing = await this.prisma.client.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Client not found');

    try {
      const client = await this.prisma.client.update({
        where: { id },
        data: { name: input.name, notes: input.notes },
      });
      return this.toSummary(client);
    } catch (err) {
      throw this.translateError(err);
    }
  }

  async remove(id: string): Promise<void> {
    const orgId = requireOrgId(this.cls);
    const existing = await this.prisma.client.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Client not found');
    await this.prisma.client.delete({ where: { id } });
  }

  private translateError(err: unknown): Error {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('A client with this name already exists');
    }
    return err as Error;
  }

  private toSummary(c: ClientRecord): ClientSummary {
    return {
      id: c.id,
      name: c.name,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
