import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import type { CreateDependencyInput, DependencySummary, TaskStatusName } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanModifyTask } from '../tasks/task-permissions';

interface DependencyRecord {
  id: string;
  dependsOnId: string;
  dependsOn: { title: string; status: string };
}

@Injectable()
export class DependenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async list(taskId: string): Promise<DependencySummary[]> {
    const orgId = requireOrgId(this.cls);
    await this.getTaskOrThrow(taskId, orgId);

    const deps = await this.prisma.taskDependency.findMany({
      where: { taskId },
      include: { dependsOn: true },
      orderBy: { createdAt: 'asc' },
    });
    return deps.map((d) => this.toSummary(d));
  }

  async create(taskId: string, input: CreateDependencyInput): Promise<DependencySummary> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    assertCanModifyTask(this.cls, task);

    if (input.dependsOnId === taskId) {
      throw new BadRequestException('A task cannot depend on itself');
    }

    const target = await this.prisma.task.findFirst({ where: { id: input.dependsOnId, orgId } });
    if (!target) throw new BadRequestException('Target task not found in this organization');

    if (await this.wouldCreateCycle(taskId, input.dependsOnId)) {
      throw new BadRequestException('This dependency would create a cycle');
    }

    try {
      const dep = await this.prisma.taskDependency.create({
        data: { taskId, dependsOnId: input.dependsOnId },
        include: { dependsOn: true },
      });
      return this.toSummary(dep);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This dependency already exists');
      }
      throw err;
    }
  }

  async remove(taskId: string, dependencyId: string): Promise<void> {
    const orgId = requireOrgId(this.cls);
    const task = await this.getTaskOrThrow(taskId, orgId);
    assertCanModifyTask(this.cls, task);

    const existing = await this.prisma.taskDependency.findFirst({ where: { id: dependencyId, taskId } });
    if (!existing) throw new NotFoundException('Dependency not found');
    await this.prisma.taskDependency.delete({ where: { id: dependencyId } });
  }

  /**
   * Adding edge (taskId -> dependsOnId) creates a cycle if dependsOnId can
   * already reach taskId by following existing "depends on" edges forward.
   */
  private async wouldCreateCycle(taskId: string, dependsOnId: string): Promise<boolean> {
    const visited = new Set<string>();
    const queue = [dependsOnId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const edges = await this.prisma.taskDependency.findMany({
        where: { taskId: current },
        select: { dependsOnId: true },
      });
      for (const edge of edges) queue.push(edge.dependsOnId);
    }

    return false;
  }

  private async getTaskOrThrow(taskId: string, orgId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, orgId } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private toSummary(d: DependencyRecord): DependencySummary {
    return {
      id: d.id,
      dependsOnId: d.dependsOnId,
      dependsOnTitle: d.dependsOn.title,
      dependsOnStatus: d.dependsOn.status as TaskStatusName,
    };
  }
}
