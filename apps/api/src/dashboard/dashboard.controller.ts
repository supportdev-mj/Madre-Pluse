import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { dashboardQuerySchema, type DashboardQuery } from '@madre-pulse/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MANAGER')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  get(@Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery) {
    return this.dashboardService.getSummary(query);
  }
}
