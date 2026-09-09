import type { MemberSummary, RoleName } from '@madre-pulse/shared';

/** Who may be picked as an assignee: an admin sees everyone; a manager sees themself and their
 * direct reports; anyone else sees only themself. Mirrors TasksService.assertCanAssign.
 * `alwaysIncludeUserIds` keeps any already-assigned member visible (and checked) even if they
 * fall outside that range, so reassigning never silently drops someone off the list. */
export function computeAssignableMembers(
  members: MemberSummary[],
  role: RoleName | null,
  currentUserId: string | undefined,
  alwaysIncludeUserIds: string[] = [],
): MemberSummary[] {
  const active = members.filter((m) => m.status === 'ACTIVE');
  if (role === 'ADMIN') return active;
  const own = active.find((m) => m.userId === currentUserId);
  return active.filter(
    (m) =>
      m.userId === currentUserId ||
      (role === 'MANAGER' && !!own && m.managerId === own.membershipId) ||
      alwaysIncludeUserIds.includes(m.userId),
  );
}
