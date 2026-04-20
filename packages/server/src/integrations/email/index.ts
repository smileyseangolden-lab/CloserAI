import nodemailer from 'nodemailer';
import type {
  EmailProvider,
  EmailMessage,
  SendResult,
  DeliverabilityReport,
  EmailAccountConfig,
  InboundMessage,
} from '../types.js';
import { logger } from '../../utils/logger.js';
import { resolveProviderConfig } from '../../modules/admin/settingsService.js';

/**
 * Per-org SMTP transport. Reads the org's saved SMTP settings (or env fallback)
 * for every send so admin updates take effect immediately.
 */
class SMTPEmailProvider implements EmailProvider {
  constructor(
    private readonly config: {
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      from?: string;
    },
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    if (!this.config.host) {
      logger.warn({ to: message.to, subject: message.subject }, '[stub] SMTP not configured — would send email');
      return { messageId: `stub-${Date.now()}`, accepted: true };
    }
    const transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port ?? 587,
      secure: (this.config.port ?? 587) === 465,
      auth: this.config.user
        ? { user: this.config.user, pass: this.config.password ?? '' }
        : undefined,
    });
    const info = await transporter.sendMail({
      from: message.from || this.config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: message.headers,
    });
    return { messageId: info.messageId, accepted: info.accepted.length > 0 };
  }

  async checkDeliverability(domain: string): Promise<DeliverabilityReport> {
    return { domain, spf: false, dkim: false, dmarc: false };
  }

  async syncInbox(_account: EmailAccountConfig): Promise<InboundMessage[]> {
    return [];
  }
}

export async function getEmailProvider(orgId: string): Promise<EmailProvider> {
  const cfg = await resolveProviderConfig(orgId, 'smtp');
  return new SMTPEmailProvider({
    host: cfg.values.host as string | undefined,
    port: cfg.values.port as number | undefined,
    user: cfg.values.user as string | undefined,
    password: cfg.values.password as string | undefined,
    from: cfg.values.from as string | undefined,
  });
}
