import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createBlockerReportSchema,
  resolveBlockerReportSchema,
  type CreateBlockerReportInput,
  type ResolveBlockerReportInput,
} from '@madre-pulse/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BlockerReportsService } from './blocker-reports.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/blocker-reports')
export class BlockerReportsController {
  constructor(private readonly blockerReportsService: BlockerReportsService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.blockerReportsService.list(taskId);
  }

  @Post()
  create(
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(createBlockerReportSchema)) dto: CreateBlockerReportInput,
  ) {
    return this.blockerReportsService.create(taskId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  resolve(
    @Param('taskId') taskId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveBlockerReportSchema)) dto: ResolveBlockerReportInput,
  ) {
    return this.blockerReportsService.resolve(taskId, id, dto);
  }
}
