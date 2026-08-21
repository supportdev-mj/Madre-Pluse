import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { updateNotificationSchema, type UpdateNotificationInput } from '@madre-pulse/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list() {
    return this.notificationsService.list();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateNotificationSchema)) dto: UpdateNotificationInput) {
    return this.notificationsService.markRead(id, dto.read);
  }

  @Post('read-all')
  @HttpCode(204)
  markAllRead() {
    return this.notificationsService.markAllRead();
  }
}
