import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReopenRequestsController } from './reopen-requests.controller';
import { ReopenRequestsService } from './reopen-requests.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ReopenRequestsController],
  providers: [ReopenRequestsService],
})
export class ReopenRequestsModule {}
