import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BlockerReportsController } from './blocker-reports.controller';
import { BlockerReportsService } from './blocker-reports.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [BlockerReportsController],
  providers: [BlockerReportsService],
})
export class BlockerReportsModule {}
