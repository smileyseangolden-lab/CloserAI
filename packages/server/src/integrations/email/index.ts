import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import type {
  EmailProvider,
  EmailMessage,
  SendResult,
  DeliverabilityReport,
  EmailAccountConfig,
  InboundMessage,
} from '../types.js';
import { logger } from '../../utils/logger.js';

/**
 * Default SMTP email provider. Uses the org-level SMTP config from env
 * when no per-account override is available. When SMTP credentials are
 * missing (local dev) this logs instead of sending.
 */
class SMTPEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<SendResult> {
    if (!env.SMTP_HOST) {
      logger.warn({ to: message.to, subject: message.subject }, '[stub] SMTP not configured — would send email');
      return { messageId: `stub-${Date.now()}`, accepted: true };
    }

    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: (env.SMTP_PORT ?? 587) === 465,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
    });

    const info = await transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: message.headers,
    });

    return { messageId: info.messageId, accepted: info.accepted.length > 0 };
  }

  async checkDeliverability(domain: string): Promise<DeliverabilityReport> {
    // Stub — real impl would do DNS lookups for SPF/DKIM/DMARC.
    return { domain, spf: false, dkim: false, dmarc: false };
  }

  async syncInbox(_account: EmailAccountConfig): Promise<InboundMessage[]> {
    // Stub — real impl would use IMAP and mailparser.
    return [];
  }
}

let cached: EmailProvider | null = null;
export function getEmailProvider(): EmailProvider {
  if (!cached) cached = new SMTPEmailProvider();
  return cached;
}
