import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { GoogleIntegrationModule } from '../google-integration/google-integration.module';
import { MomModule } from '../mom/mom.module';
import { GoogleMeetApiService } from './google-meet-api.service';
import { MeetingSyncController } from './meeting-sync.controller';
import { MeetingSyncProcessor } from './meeting-sync.processor';
import { MeetingSyncService } from './meeting-sync.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'meeting-sync' }), GoogleIntegrationModule, MomModule],
  controllers: [MeetingSyncController],
  providers: [GoogleMeetApiService, MeetingSyncService, MeetingSyncProcessor],
})
export class MeetingSyncModule {}
