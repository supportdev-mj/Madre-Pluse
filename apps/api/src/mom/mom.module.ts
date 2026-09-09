import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { TasksModule } from '../tasks/tasks.module';
import { MomController } from './mom.controller';
import { MomExtractionService } from './mom-extraction.service';
import { MomService } from './mom.service';

@Module({
  imports: [AuthModule, StorageModule, TasksModule],
  controllers: [MomController],
  providers: [MomService, MomExtractionService],
  exports: [MomService],
})
export class MomModule {}
