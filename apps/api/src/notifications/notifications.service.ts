import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { NotificationType } from '@prisma/client';
import type { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import type { NotificationSummary, NotificationTypeName } from '@madre-pulse/shared';
import type { AppClsStore } from '../common/tenant/cls-store.type';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { SendNotificationEmailJob } from './email.processor';

interface NotificationRecord {
  id: string;
  type: NotificationType;
  message: string;
  read: boolean;
  taskId: string | null;
  task: { title: string } | null;
  createdAt: Date;
}

export interface NotifyParams {
  orgId: string;
  userId: string;
  type: NotificationType;
  message: string;
  taskId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly realtime: RealtimeGateway,
    @InjectQueue('email') private readonly emailQueue: Queue<SendNotificationEmailJob>,
  ) {}

  async list(): Promise<NotificationSummary[]> {
    const userId = this.currentUserId();
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      include: { task: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return notifications.map((n) => this.toSummary(n));
  }

  async markRead(id: string, read: boolean): Promise<NotificationSummary> {
    const userId = this.currentUserId();
    const existing = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Notification not found');

    const updated = await this.prisma.notification.update({ where: { id }, data: { read }, include: { task: true } });
    return this.toSummary(updated);
  }

  async markAllRead(): Promise<void> {
    const userId = this.currentUserId();
    await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  }

  /** Creates a notification, pushes it over the realtime channel, and queues an email. Called by other services. */
  async notify(params: NotifyParams): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: {
        orgId: params.orgId,
        userId: params.userId,
        type: params.type,
        message: params.message,
        taskId: params.taskId ?? null,
      },
      include: { task: true },
    });

    this.realtime.emitToUser(params.userId, 'notification', this.toSummary(notification));
    await this.emailQueue.add('send-notification-email', { notificationId: notification.id });
  }

  private currentUserId(): string {
    const userId = this.cls.get('userId');
    if (!userId) throw new ForbiddenException();
    return userId;
  }

  private toSummary(n: NotificationRecord): NotificationSummary {
    return {
      id: n.id,
      type: n.type as NotificationTypeName,
      message: n.message,
      read: n.read,
      taskId: n.taskId,
      taskTitle: n.task?.title ?? null,
      createdAt: n.createdAt.toISOString(),
    };
  }
}
