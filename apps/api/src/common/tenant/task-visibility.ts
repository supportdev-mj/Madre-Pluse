import type { Prisma } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppClsStore } from './cls-store.type';

/**
 * Who may see a given task (as creator or assignee): ADMIN sees everyone (null = no restriction).
 * Everyone else sees themself plus their direct reports, if any (Membership.managerId) — this is
 * hierarchy-based, not role-based: a "user" who nonetheless has people reporting to them in the
 * org chart gets the same broadened visibility a "manager" does, and a "manager" with no reports
 * yet sees only themself. Returns the set of user ids to check a task's createdById/assignments against.
 */
export async function getTaskVisibleUserIds(
  prisma: PrismaService,
  cls: ClsService<AppClsStore>,
  orgId: string,
): Promise<string[] | null> {
  const role = cls.get('role');
  const userId = cls.get('userId');
  if (!userId) return [];
  if (role === 'ADMIN') return null;

  const reports = await getDirectReportUserIds(prisma, cls, orgId);
  return [userId, ...reports];
}

/** null (ADMIN, unrestricted) → {}; otherwise → only tasks created by or assigned to one of userIds. */
export function taskVisibilityWhere(userIds: string[] | null): Prisma.TaskWhereInput {
  if (userIds === null) return {};
  return { OR: [{ createdById: { in: userIds } }, { assignments: { some: { userId: { in: userIds } } } }] };
}

/** The current user's direct reports only (never includes themself) — used for task verification,
 * where a manager must never be able to approve their own work, only a subordinate's. */
export async function getDirectReportUserIds(
  prisma: PrismaService,
  cls: ClsService<AppClsStore>,
  orgId: string,
): Promise<string[]> {
  const userId = cls.get('userId');
  if (!userId) return [];
  const ownMembership = await prisma.membership.findFirst({ where: { userId, orgId } });
  if (!ownMembership) return [];

  const reports = await prisma.membership.findMany({
    where: { orgId, managerId: ownMembership.id },
    select: { userId: true },
  });
  return reports.map((r) => r.userId);
}
