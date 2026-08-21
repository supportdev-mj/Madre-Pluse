import { Processor, WorkerHost } from '@nestjs/bullmq';
import { DueSoonService } from './due-soon.service';

@Processor('due-soon')
export class DueSoonProcessor extends WorkerHost {
  constructor(private readonly dueSoonService: DueSoonService) {
    super();
  }

  async process(): Promise<void> {
    await this.dueSoonService.scan();
  }
}
