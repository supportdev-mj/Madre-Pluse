import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createSubtaskSchema, updateSubtaskSchema, type CreateSubtaskInput, type UpdateSubtaskInput } from '@madre-pulse/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SubtasksService } from './subtasks.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/subtasks')
export class SubtasksController {
  constructor(private readonly subtasksService: SubtasksService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.subtasksService.list(taskId);
  }

  @Post()
  create(@Param('taskId') taskId: string, @Body(new ZodValidationPipe(createSubtaskSchema)) dto: CreateSubtaskInput) {
    return this.subtasksService.create(taskId, dto);
  }

  @Patch(':id')
  update(
    @Param('taskId') taskId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSubtaskSchema)) dto: UpdateSubtaskInput,
  ) {
    return this.subtasksService.update(taskId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('taskId') taskId: string, @Param('id') id: string) {
    return this.subtasksService.remove(taskId, id);
  }
}
