import type { Prisma } from '@prisma/client';
import type { ClsService } from 'nestjs-cls';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppClsStore } from './cls-store.type';

/**
 * Who may see a given task (as creator or assignee): ADMIN sees everyone (null = no restriction),
 * MANAGER sees themself + their direct reports (Membership.managerId), USER sees only themself.
 * Returns the set of user ids to check a task's createdById/assignments against.
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
  if (role === 'USER') return [userId];

  const ownMembership = await prisma.membership.findFirst({ where: { userId, orgId } });
  if (!ownMembership) return [userId];

  const reports = await prisma.membership.findMany({
    where: { orgId, managerId: ownMembership.id },
    select: { userId: true },
  });
  return [userId, ...reports.map((r) => r.userId)];
}

/** null (ADMIN, unrestricted) → {}; otherwise → only tasks created by or assigned to one of userIds. */
export function taskVisibilityWhere(userIds: string[] | null): Prisma.TaskWhereInput {
  if (userIds === null) return {};
  return { OR: [{ createdById: { in: userIds } }, { assignments: { some: { userId: { in: userIds } } } }] };
}
