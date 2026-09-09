import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { dashboardQuerySchema, type DashboardQuery } from '@madre-pulse/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DashboardService } from './dashboard.service';

// Open to every authenticated user — DashboardService.getSummary() scopes the data itself
// (personal-only, or the viewer's normal visibility breadth for "team"), so there's nothing left
// for a role guard to gate here.
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  get(@Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery) {
    return this.dashboardService.getSummary(query);
  }
}
