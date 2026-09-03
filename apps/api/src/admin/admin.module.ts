import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminLlmSettingsController } from './admin-llm-settings.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController, AdminLlmSettingsController],
  providers: [AdminService],
})
export class AdminModule {}
