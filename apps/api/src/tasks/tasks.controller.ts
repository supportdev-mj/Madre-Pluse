import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createTaskSchema,
  decideVerificationSchema,
  listTasksQuerySchema,
  updateTaskSchema,
  type CreateTaskInput,
  type DecideVerificationInput,
  type ListTasksQuery,
  type UpdateTaskInput,
} from '@madre-pulse/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TasksService } from './tasks.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listTasksQuerySchema)) query: ListTasksQuery) {
    return this.tasksService.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tasksService.get(id);
  }

  @Get(':id/activity')
  listActivity(@Param('id') id: string) {
    return this.tasksService.listActivity(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskInput) {
    return this.tasksService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateTaskSchema)) dto: UpdateTaskInput) {
    return this.tasksService.update(id, dto);
  }

  @Post(':id/start')
  startTracking(@Param('id') id: string) {
    return this.tasksService.startTracking(id);
  }

  @Post(':id/complete')
  completeTracking(@Param('id') id: string) {
    return this.tasksService.completeTracking(id);
  }

  @Post(':id/submit-for-verification')
  submitForVerification(@Param('id') id: string) {
    return this.tasksService.submitForVerification(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch(':id/verify')
  verifyTask(@Param('id') id: string, @Body(new ZodValidationPipe(decideVerificationSchema)) dto: DecideVerificationInput) {
    return this.tasksService.verifyTask(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }
}
