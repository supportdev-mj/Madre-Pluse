import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DueSoonProcessor } from './due-soon.processor';
import { DueSoonService } from './due-soon.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'due-soon' }), NotificationsModule],
  providers: [DueSoonService, DueSoonProcessor],
})
export class DueSoonModule {}
