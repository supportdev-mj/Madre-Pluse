import { Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import { MeetingSyncService } from './meeting-sync.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('integrations/google')
export class MeetingSyncController {
  constructor(
    private readonly meetingSyncService: MeetingSyncService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  @Roles('ADMIN')
  @Post('sync')
  sync() {
    const orgId = requireOrgId(this.cls);
    const userId = this.cls.get('userId');
    if (!userId) throw new ForbiddenException();
    return this.meetingSyncService.syncOrg(orgId, userId);
  }
}
