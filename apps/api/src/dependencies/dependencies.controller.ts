import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { createDependencySchema, type CreateDependencyInput } from '@madre-pulse/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DependenciesService } from './dependencies.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/dependencies')
export class DependenciesController {
  constructor(private readonly dependenciesService: DependenciesService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.dependenciesService.list(taskId);
  }

  @Post()
  create(@Param('taskId') taskId: string, @Body(new ZodValidationPipe(createDependencySchema)) dto: CreateDependencyInput) {
    return this.dependenciesService.create(taskId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('taskId') taskId: string, @Param('id') id: string) {
    return this.dependenciesService.remove(taskId, id);
  }
}
