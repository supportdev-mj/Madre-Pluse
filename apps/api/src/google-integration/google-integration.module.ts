import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoogleIntegrationController } from './google-integration.controller';
import { GoogleIntegrationService } from './google-integration.service';

@Module({
  imports: [AuthModule],
  controllers: [GoogleIntegrationController],
  providers: [GoogleIntegrationService],
  exports: [GoogleIntegrationService],
})
export class GoogleIntegrationModule {}
