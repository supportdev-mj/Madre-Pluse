import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Env } from '../config/env.validation';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;
  private readonly configured: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get('SMTP_FROM', { infer: true });
    const host = config.get('SMTP_HOST', { infer: true });
    this.configured = host.length > 0;

    const user = config.get('SMTP_USER', { infer: true });
    this.transporter = this.configured
      ? nodemailer.createTransport({
          host,
          port: config.get('SMTP_PORT', { infer: true }),
          auth: user ? { user, pass: config.get('SMTP_PASS', { infer: true }) } : undefined,
        })
      : null;
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.configured || !this.transporter) {
      this.logger.log(`SMTP not configured — email suppressed. To: ${to} | Subject: ${subject} | Body: ${text}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text });
  }
}
