import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { createCommentSchema, type CreateCommentInput } from '@madre-pulse/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CommentsService } from './comments.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.commentsService.list(taskId);
  }

  @Post()
  create(@Param('taskId') taskId: string, @Body(new ZodValidationPipe(createCommentSchema)) dto: CreateCommentInput) {
    return this.commentsService.create(taskId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('taskId') taskId: string, @Param('id') id: string) {
    return this.commentsService.remove(taskId, id);
  }
}
