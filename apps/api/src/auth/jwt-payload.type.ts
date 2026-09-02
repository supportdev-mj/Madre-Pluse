import type { RoleName } from '@madre-pulse/shared';

export interface JwtPayload {
  sub: string;
  orgId: string;
  role: RoleName;
  email: string;
  isSuperAdmin: boolean;
}
