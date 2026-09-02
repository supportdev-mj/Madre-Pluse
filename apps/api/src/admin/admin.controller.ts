import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { updateOrganizationAdminSchema, type UpdateOrganizationAdminInput } from '@madre-pulse/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/organizations')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  list() {
    return this.adminService.listOrganizations();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateOrganizationAdminSchema)) dto: UpdateOrganizationAdminInput) {
    return this.adminService.updateOrganization(id, dto);
  }
}
