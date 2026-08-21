import { UnauthorizedException } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';
import type { AppClsStore } from './cls-store.type';

export function requireOrgId(cls: ClsService<AppClsStore>): string {
  const orgId = cls.get('orgId');
  if (!orgId) throw new UnauthorizedException();
  return orgId;
}
