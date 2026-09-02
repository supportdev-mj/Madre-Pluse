import { Controller, Delete, Get, HttpCode, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { requireOrgId } from '../common/tenant/require-org-id';
import type { Env } from '../config/env.validation';
import { GoogleIntegrationService } from './google-integration.service';

@Controller('integrations/google')
export class GoogleIntegrationController {
  constructor(
    private readonly googleIntegrationService: GoogleIntegrationService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('status')
  getStatus() {
    const orgId = requireOrgId(this.cls);
    return this.googleIntegrationService.getStatus(orgId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('connect-url')
  getConnectUrl() {
    const orgId = requireOrgId(this.cls);
    const userId = this.cls.get('userId');
    if (!userId) throw new Error('Unreachable: JwtAuthGuard guarantees userId');
    return { url: this.googleIntegrationService.getAuthUrl(orgId, userId) };
  }

  /**
   * Public by necessity: Google redirects the user's browser here directly, with no
   * Authorization header. CSRF protection comes entirely from the signed `state` JWT
   * (minted in getConnectUrl, verified in the service) rather than JwtAuthGuard.
   */
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const webUrl = this.config.get('CORS_ORIGIN', { infer: true });
    try {
      await this.googleIntegrationService.handleCallback(code, state);
      res.redirect(`${webUrl}/settings?google=connected`);
    } catch {
      res.redirect(`${webUrl}/settings?google=error`);
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete()
  @HttpCode(204)
  async disconnect() {
    const orgId = requireOrgId(this.cls);
    await this.googleIntegrationService.disconnect(orgId);
  }
}
