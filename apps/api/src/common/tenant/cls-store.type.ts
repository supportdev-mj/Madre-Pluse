import type { ClsStore } from 'nestjs-cls';
import type { RoleName } from '@madre-pulse/shared';

export interface AppClsStore extends ClsStore {
  userId?: string;
  orgId?: string;
  role?: RoleName;
  isSuperAdmin?: boolean;
}
