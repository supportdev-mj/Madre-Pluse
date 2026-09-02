import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { parseRedisConnection } from './config/redis-connection';
import { validateEnv, type Env } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './common/health/health.controller';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { AdminModule } from './admin/admin.module';
import { GoogleIntegrationModule } from './google-integration/google-integration.module';
import { MembersModule } from './members/members.module';
import { ClientsModule } from './clients/clients.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { SubtasksModule } from './subtasks/subtasks.module';
import { DependenciesModule } from './dependencies/dependencies.module';
import { CommentsModule } from './comments/comments.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DueSoonModule } from './due-soon/due-soon.module';
import { ReopenRequestsModule } from './reopen-requests/reopen-requests.module';
import { BlockerReportsModule } from './blocker-reports/blocker-reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: parseRedisConnection(config.get('REDIS_URL', { infer: true })),
      }),
    }),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    AdminModule,
    GoogleIntegrationModule,
    MembersModule,
    ClientsModule,
    ProjectsModule,
    TasksModule,
    SubtasksModule,
    DependenciesModule,
    CommentsModule,
    AttachmentsModule,
    TimeEntriesModule,
    NotificationsModule,
    DueSoonModule,
    ReopenRequestsModule,
    BlockerReportsModule,
    DashboardModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
