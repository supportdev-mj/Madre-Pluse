import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EditRequestsController } from './edit-requests.controller';
import { EditRequestsService } from './edit-requests.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [EditRequestsController],
  providers: [EditRequestsService],
})
export class EditRequestsModule {}
