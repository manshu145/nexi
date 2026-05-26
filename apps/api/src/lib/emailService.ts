import type { Env } from '../env.js';
import type { Logger } from '../logger.js';

export interface EmailService {
  sendEmail(to: string, subject: string, htmlBody: string): Promise<{ success: boolean; id?: string }>;
  sendBulkEmail(emails: string[], subject: string, htmlBody: string): Promise<{ sent: number; failed: number }>;
}

export function createEmailService(env: Env, logger: Logger): EmailService {
  const apiKey = env.RESEND_API_KEY;
  const configured = !!(apiKey && apiKey.length > 5);

  return {
    async sendEmail(to: string, subject: string, htmlBody: string) {
      if (!configured) {
        logger.warn('email.not_configured', { to, subject });
        return { success: false };
      }
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ from: 'Nexigrate <noreply@nexigrate.com>', to: [to], subject, html: htmlBody }),
        });
        if (!res.ok) { const err = await res.text(); logger.error('email.send_failed', { to, status: res.status, err }); return { success: false }; }
        const data = (await res.json()) as { id?: string };
        logger.info('email.sent', { to, subject, id: data.id });
        return { success: true, id: data.id };
      } catch (err) {
        logger.error('email.error', { to, error: err instanceof Error ? err.message : String(err) });
        return { success: false };
      }
    },

    async sendBulkEmail(emails: string[], subject: string, htmlBody: string) {
      if (!configured) { logger.warn('email.bulk_not_configured'); return { sent: 0, failed: emails.length }; }
      let sent = 0, failed = 0;
      // Send in batches of 10
      for (let i = 0; i < emails.length; i += 10) {
        const batch = emails.slice(i, i + 10);
        const results = await Promise.allSettled(
          batch.map(email => this.sendEmail(email, subject, htmlBody))
        );
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.success) sent++;
          else failed++;
        }
      }
      logger.info('email.bulk_sent', { total: emails.length, sent, failed });
      return { sent, failed };
    },
  };
}

// Email templates
export function welcomeEmailTemplate(name: string, exam: string): { subject: string; html: string } {
  return {
    subject: `Welcome to Nexigrate, ${name}! 🎉`,
    html: `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#fff;border-radius:12px"><h1 style="color:#1a1a1a;font-size:24px">Welcome to Nexigrate!</h1><p style="color:#555;font-size:16px;line-height:1.6">Hi ${name},</p><p style="color:#555;font-size:16px;line-height:1.6">You're now preparing for <strong>${exam}</strong> with AI-powered learning. Your journey starts here.</p><a href="https://app.nexigrate.com/dashboard" style="display:inline-block;background:#f59e0b;color:#1a1a1a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">Start Studying →</a><p style="color:#999;font-size:13px;margin-top:32px">— Team Nexigrate</p></div>`,
  };
}

export function announcementEmailTemplate(title: string, body: string): { subject: string; html: string } {
  return {
    subject: `📢 ${title} — Nexigrate`,
    html: `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#fff;border-radius:12px"><h1 style="color:#1a1a1a;font-size:22px">${title}</h1><p style="color:#555;font-size:16px;line-height:1.6">${body}</p><a href="https://app.nexigrate.com/dashboard" style="display:inline-block;background:#f59e0b;color:#1a1a1a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">Open Nexigrate</a><p style="color:#999;font-size:13px;margin-top:32px">— Team Nexigrate</p></div>`,
  };
}
