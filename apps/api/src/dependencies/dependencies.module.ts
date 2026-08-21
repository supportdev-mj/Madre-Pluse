import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DependenciesController } from './dependencies.controller';
import { DependenciesService } from './dependencies.service';

@Module({
  imports: [AuthModule],
  controllers: [DependenciesController],
  providers: [DependenciesService],
})
export class DependenciesModule {}
