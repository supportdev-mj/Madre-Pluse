import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createTimeEntrySchema,
  updateTimeEntrySchema,
  type CreateTimeEntryInput,
  type UpdateTimeEntryInput,
} from '@madre-pulse/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TimeEntriesService } from './time-entries.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.timeEntriesService.list(taskId);
  }

  @Post()
  create(@Param('taskId') taskId: string, @Body(new ZodValidationPipe(createTimeEntrySchema)) dto: CreateTimeEntryInput) {
    return this.timeEntriesService.create(taskId, dto);
  }

  @Patch(':id')
  update(
    @Param('taskId') taskId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTimeEntrySchema)) dto: UpdateTimeEntryInput,
  ) {
    return this.timeEntriesService.update(taskId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('taskId') taskId: string, @Param('id') id: string) {
    return this.timeEntriesService.remove(taskId, id);
  }
}
