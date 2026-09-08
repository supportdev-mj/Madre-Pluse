import { ForbiddenException } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { getDirectReportUserIds } from '../common/tenant/task-visibility';
import type { PrismaService } from '../prisma/prisma.service';

/** Gate for a task's collaborative sub-resources (subtasks, dependencies, blocker reports, reopen
 * requests) — the creator or an assignee participates in these the same as an admin/manager. */
export function assertCanModifyTask(
  cls: ClsService<AppClsStore>,
  task: { assigneeIds: string[]; createdById: string },
): void {
  const role = cls.get('role');
  if (role === 'ADMIN' || role === 'MANAGER') return;

  const userId = cls.get('userId');
  if ((userId && task.assigneeIds.includes(userId)) || task.createdById === userId) return;

  throw new ForbiddenException('You can only modify tasks you created or are assigned to');
}

/** Gate for editing the task itself (title, due date, assignees, status, etc.) — unlike the
 * sub-resources above, this is an admin/manager action only. Being the creator or an assignee no
 * longer grants edit rights on its own; an assignee interacts with a task through its own
 * purpose-built actions instead (chat, Start/Stop, submit for verification). */
export async function assertCanEditTask(
  prisma: PrismaService,
  cls: ClsService<AppClsStore>,
  orgId: string,
  assigneeIds: string[],
): Promise<void> {
  const role = cls.get('role');
  if (role === 'ADMIN') return;
  if (role === 'MANAGER') {
    const reportIds = await getDirectReportUserIds(prisma, cls, orgId);
    if (assigneeIds.some((id) => reportIds.includes(id))) return;
  }
  throw new ForbiddenException('Only an admin, or the immediate manager of an assignee, can edit this task');
}
