import { Processor, WorkerHost } from '@nestjs/bullmq';
import { MeetingSyncService } from './meeting-sync.service';

@Processor('meeting-sync')
export class MeetingSyncProcessor extends WorkerHost {
  constructor(private readonly meetingSyncService: MeetingSyncService) {
    super();
  }

  async process(): Promise<void> {
    await this.meetingSyncService.syncAllConnectedOrgs();
  }
}
