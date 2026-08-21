import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import type { AppClsStore } from '../../common/tenant/cls-store.type';
import type { JwtPayload } from '../jwt-payload.type';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly cls: ClsService<AppClsStore>) {
    super();
  }

  handleRequest<TUser = JwtPayload>(err: unknown, user: JwtPayload | false, _info: unknown, _context: ExecutionContext): TUser {
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    this.cls.set('userId', user.sub);
    this.cls.set('orgId', user.orgId);
    this.cls.set('role', user.role);
    return user as TUser;
  }
}
