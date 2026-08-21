import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { Env } from '../config/env.validation';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';

export interface SendNotificationEmailJob {
  notificationId: string;
}

@Processor('email')
export class EmailProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async process(job: Job<SendNotificationEmailJob>): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: job.data.notificationId },
      include: { user: true },
    });
    if (!notification) return;

    const webUrl = this.config.get('CORS_ORIGIN', { infer: true });
    const link = notification.taskId ? `${webUrl}/tasks/${notification.taskId}` : webUrl;
    await this.emailService.send(notification.user.email, 'Madre Pulse notification', `${notification.message}\n\n${link}`);
  }
}
