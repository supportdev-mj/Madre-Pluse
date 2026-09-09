import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createEditRequestSchema,
  resolveEditRequestSchema,
  type CreateEditRequestInput,
  type ResolveEditRequestInput,
} from '@madre-pulse/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { EditRequestsService } from './edit-requests.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/edit-requests')
export class EditRequestsController {
  constructor(private readonly editRequestsService: EditRequestsService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.editRequestsService.list(taskId);
  }

  @Post()
  create(@Param('taskId') taskId: string, @Body(new ZodValidationPipe(createEditRequestSchema)) dto: CreateEditRequestInput) {
    return this.editRequestsService.create(taskId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  resolve(
    @Param('taskId') taskId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveEditRequestSchema)) dto: ResolveEditRequestInput,
  ) {
    return this.editRequestsService.resolve(taskId, id, dto);
  }
}
