import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { updateLlmSettingsSchema, type UpdateLlmSettingsInput } from '@madre-pulse/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/llm-settings')
export class AdminLlmSettingsController {
  constructor(
    private readonly adminService: AdminService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  @Get()
  get() {
    return this.adminService.getLlmSettings();
  }

  @Put()
  update(@Body(new ZodValidationPipe(updateLlmSettingsSchema)) dto: UpdateLlmSettingsInput) {
    const updatedById = this.cls.get('userId');
    if (!updatedById) throw new Error('Unreachable: JwtAuthGuard guarantees userId');
    return this.adminService.updateLlmSettings(dto, updatedById);
  }
}
