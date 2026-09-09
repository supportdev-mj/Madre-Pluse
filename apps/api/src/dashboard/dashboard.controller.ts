import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

// Not @Roles-gated: DashboardService.getSummary() itself decides who's allowed, since access is
// hierarchy-based (admin, manager, or anyone with direct reports), not a fixed role check.
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  get() {
    return this.dashboardService.getSummary();
  }
}
