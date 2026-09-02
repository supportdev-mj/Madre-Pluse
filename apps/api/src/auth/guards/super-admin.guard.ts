import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { JwtPayload } from '../jwt-payload.type';

/**
 * Gates the platform-admin surface (cross-tenant org/plan management). Deliberately independent
 * of RolesGuard/@Roles: isSuperAdmin is a platform-wide flag on the User record, not a
 * per-organization Role — someone can be a superadmin while holding any (or no) role in whatever
 * org they're currently logged into.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!request.user?.isSuperAdmin) {
      throw new ForbiddenException('Superadmin access required');
    }
    return true;
  }
}
