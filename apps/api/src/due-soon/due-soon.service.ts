import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class DueSoonService implements OnModuleInit {
  private readonly logger = new Logger(DueSoonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @InjectQueue('due-soon') private readonly queue: Queue,
  ) {}

  /** Registers the hourly scan as a BullMQ repeatable job. A fixed jobId means re-registering on every app restart doesn't create duplicate schedules. */
  async onModuleInit(): Promise<void> {
    await this.queue.add('scan', {}, { repeat: { every: ONE_HOUR_MS }, jobId: 'due-soon-scan' });
  }

  async scan(): Promise<void> {
    const now = new Date();
    const cutoff = new Date(now.getTime() + LOOKAHEAD_MS);

    const candidates = await this.prisma.task.findMany({
      where: {
        status: { not: 'DONE' },
        assigneeId: { not: null },
        dueDate: { gte: now, lte: cutoff },
      },
    });

    let notified = 0;
    for (const task of candidates) {
      if (!task.assigneeId) continue;

      const alreadyNotified = await this.prisma.notification.findFirst({
        where: {
          taskId: task.id,
          userId: task.assigneeId,
          type: 'TASK_DUE_SOON',
          createdAt: { gte: new Date(now.getTime() - LOOKAHEAD_MS) },
        },
      });
      if (alreadyNotified) continue;

      await this.notifications.notify({
        orgId: task.orgId,
        userId: task.assigneeId,
        type: 'TASK_DUE_SOON',
        message: `"${task.title}" is due soon`,
        taskId: task.id,
      });
      notified++;
    }

    this.logger.log(`Due-soon scan: ${candidates.length} candidate task(s), ${notified} notification(s) sent`);
  }
}
