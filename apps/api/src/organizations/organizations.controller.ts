import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { updateOrganizationSchema, type UpdateOrganizationInput } from '@madre-pulse/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { OrganizationsService } from './organizations.service';

@UseGuards(JwtAuthGuard)
@Controller('organization')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  get() {
    return this.organizationsService.get();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch()
  update(@Body(new ZodValidationPipe(updateOrganizationSchema)) dto: UpdateOrganizationInput) {
    return this.organizationsService.update(dto);
  }
}
