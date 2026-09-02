import { ForbiddenException } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../common/tenant/cls-store.type';

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
