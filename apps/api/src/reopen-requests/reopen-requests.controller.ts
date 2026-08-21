import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createReopenRequestSchema,
  decideReopenRequestSchema,
  type CreateReopenRequestInput,
  type DecideReopenRequestInput,
} from '@madre-pulse/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ReopenRequestsService } from './reopen-requests.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/reopen-requests')
export class ReopenRequestsController {
  constructor(private readonly reopenRequestsService: ReopenRequestsService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.reopenRequestsService.list(taskId);
  }

  @Post()
  create(
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(createReopenRequestSchema)) dto: CreateReopenRequestInput,
  ) {
    return this.reopenRequestsService.create(taskId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  decide(
    @Param('taskId') taskId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(decideReopenRequestSchema)) dto: DecideReopenRequestInput,
  ) {
    return this.reopenRequestsService.decide(taskId, id, dto);
  }
}
