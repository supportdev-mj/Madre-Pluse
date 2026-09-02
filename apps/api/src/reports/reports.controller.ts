import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { reportsQuerySchema, type ReportsQuery } from '@madre-pulse/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ReportsService } from './reports.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MANAGER')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('productivity')
  getProductivity(@Query(new ZodValidationPipe(reportsQuerySchema)) query: ReportsQuery) {
    return this.reportsService.getProductivity(query);
  }

  @Get('productivity.csv')
  async getProductivityCsv(
    @Query(new ZodValidationPipe(reportsQuerySchema)) query: ReportsQuery,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.reportsService.getProductivityCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="productivity-report.csv"');
    res.send(csv);
  }
}
