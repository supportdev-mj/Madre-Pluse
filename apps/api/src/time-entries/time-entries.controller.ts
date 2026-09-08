import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { updateTimeEntrySchema, type UpdateTimeEntryInput } from '@madre-pulse/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TimeEntriesService } from './time-entries.service';

// No POST/DELETE route — entries are only ever produced by TasksService's Start/Complete timer
// flow, never created directly by a client, and are a permanent log that no one can remove.
// PATCH remains, for correcting a mistaken note/duration.
@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/time-entries')
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.timeEntriesService.list(taskId);
  }

  @Patch(':id')
  update(
    @Param('taskId') taskId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTimeEntrySchema)) dto: UpdateTimeEntryInput,
  ) {
    return this.timeEntriesService.update(taskId, id, dto);
  }
}
