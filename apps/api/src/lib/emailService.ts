import type { Env } from '../env.js';
import type { Logger } from '../logger.js';
import { getResendConfig, type ServiceKeyStore } from './serviceKeyStore.js';
import type { EmailMarketingStore, EmailType } from './emailMarketingStore.js';

export interface EmailService {
  isConfigured(): Promise<boolean>;
  sendEmail(to: string, subject: string, htmlBody: string): Promise<{ success: boolean; id?: string }>;
  sendBulkEmail(emails: string[], subject: string, htmlBody: string): Promise<{ sent: number; failed: number }>;
  sendWelcome(to: string, name: string, exam: string, credits: number, language: 'en' | 'hi'): Promise<boolean>;
  sendStreakReminder(to: string, name: string, streak: number, language: 'en' | 'hi'): Promise<boolean>;
  sendPlanExpiry(to: string, name: string, plan: string, expiresAt: string, language: 'en' | 'hi'): Promise<boolean>;
  sendPaymentSuccess(to: string, name: string, plan: string, expiresAt: string, amount: number): Promise<boolean>;
  sendCancellationConfirmation(to: string, name: string, plan: string, expiresAt: string): Promise<boolean>;
  sendCustom(to: string, subject: string, htmlBody: string): Promise<boolean>;
}

function baseTemplate(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><div style="max-width:600px;margin:0 auto;padding:24px"><div style="text-align:center;padding:16px 0;border-bottom:3px solid #D97706"><img src="https://app.nexigrate.com/logo.png" alt="Nexigrate" width="120" style="display:inline-block"></div><div style="background:#fff;padding:32px 24px;border-radius:12px;margin-top:16px;border:1px solid #E7E5E4">${content}</div><div style="text-align:center;padding:24px 0;color:#78716C;font-size:12px"><p>&copy; 2026 Nexigrate &middot; <a href="https://app.nexigrate.com/unsubscribe" style="color:#78716C">Unsubscribe</a> &middot; <a href="https://nexigrate.com/privacy" style="color:#78716C">Privacy Policy</a></p></div></div></body></html>`;
}

function ctaButton(text: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0"><a href="${url}" style="display:inline-block;background:#D97706;color:#fff;padding:14px 32px;border-radius:99px;text-decoration:none;font-weight:600;font-size:14px">${text}</a></div>`;
}

/**
 * Resolve the active Resend config at call time. PR-37: prefers
 * `serviceKeys.fields.resend.apiKey` (admin-saved) over the env var
 * fallback. Returning null means "not configured" — every public method
 * in this service handles that by logging + returning a non-fatal
 * `{ success: false }` so calling code never crashes on a missing key.
 */
async function resolveResend(serviceKeys: ServiceKeyStore | undefined, env: Env, logger: Logger) {
  if (serviceKeys) {
    const cfg = await getResendConfig(serviceKeys, env);
    if (cfg) return cfg;
  }
  // Fallback for callers wired before PR-37 (createEmailService(env, logger)
  // with no store) — keep the historical env-var behaviour so an existing
  // deployment doesn't regress while PR-37 ships.
  if (env.RESEND_API_KEY && env.RESEND_API_KEY.length > 5) {
    return {
      apiKey: env.RESEND_API_KEY,
      fromEmail: 'hello@nexigrate.com',
      fromName: 'Nexigrate',
    };
  }
  logger.warn('email.not_configured');
  return null;
}

/**
 * Factory for the email service.
 *
 * PR-37: now optionally accepts a `ServiceKeyStore` so the live
 * Razorpay/Resend keys saved in the admin panel take precedence over
 * env vars at call time. The store is optional so existing call sites
 * (createEmailService(env, logger)) keep working unchanged — they'll
 * just use env-only behaviour, same as before.
 *
 * Email Marketing PR: now optionally accepts an `EmailMarketingStore`
 * to log every email sent, check if email types are enabled, and
 * read custom templates from Firestore. Falls back to hardcoded
 * templates when no store is provided or no custom template exists.
 */
export function createEmailService(env: Env, logger: Logger, serviceKeys?: ServiceKeyStore, emailMarketing?: EmailMarketingStore): EmailService {

  /**
   * Resolve config + send via Resend's HTTPS API. Returns the message
   * id on success, undefined on any failure (logged). Reads the key
   * fresh each call so the admin can rotate without restarting Cloud
   * Run instances.
   */
  async function send(to: string, subject: string, html: string, emailType?: EmailType, senderOverride?: { email: string; name: string }): Promise<{ success: boolean; id?: string }> {
    const cfg = await resolveResend(serviceKeys, env, logger);
    if (!cfg) {
      return { success: false };
    }

    // Check if this email type is enabled (if marketing store available)
    if (emailType && emailMarketing) {
      const enabled = await emailMarketing.isTypeEnabled(emailType);
      if (!enabled) {
        logger.info('email.type_disabled', { to, type: emailType });
        return { success: false };
      }
    }

    // Determine sender — type-specific override > explicit override > default config
    let fromEmail = cfg.fromEmail;
    let fromName = cfg.fromName;
    if (senderOverride) {
      fromEmail = senderOverride.email;
      fromName = senderOverride.name;
    } else if (emailType && emailMarketing) {
      const sender = await emailMarketing.getSenderForType(emailType);
      fromEmail = sender.email;
      fromName = sender.name;
    }

    try {
      const FROM = `${fromName} <${fromEmail}>`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [to], subject, html, reply_to: 'support@nexigrate.com' }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        logger.error('email.send_failed', { to, subject, status: res.status, error: err.slice(0, 200) });
        // Log failure to marketing store
        if (emailMarketing) {
          await emailMarketing.logEmail({
            to, subject, type: emailType ?? 'custom', status: 'failed',
            senderEmail: fromEmail, senderName: fromName,
            error: err.slice(0, 200), sentAt: new Date().toISOString(),
          }).catch(() => {});
        }
        return { success: false };
      }
      const data = (await res.json()) as { id?: string };
      logger.info('email.sent', { to, subject, id: data.id });
      // Log success to marketing store
      if (emailMarketing) {
        await emailMarketing.logEmail({
          to, subject, type: emailType ?? 'custom', status: 'sent',
          senderEmail: fromEmail, senderName: fromName,
          messageId: data.id, sentAt: new Date().toISOString(),
        }).catch(() => {});
      }
      return { success: true, id: data.id };
    } catch (err) {
      logger.error('email.send_error', { to, subject, error: err instanceof Error ? err.message : String(err) });
      // Log error to marketing store
      if (emailMarketing) {
        await emailMarketing.logEmail({
          to, subject, type: emailType ?? 'custom', status: 'failed',
          senderEmail: fromEmail, senderName: fromName,
          error: err instanceof Error ? err.message : String(err),
          sentAt: new Date().toISOString(),
        }).catch(() => {});
      }
      return { success: false };
    }
  }

  async function sendBoolean(to: string, subject: string, html: string, emailType?: EmailType): Promise<boolean> {
    const r = await send(to, subject, html, emailType);
    return r.success;
  }

  return {
    async isConfigured() {
      const cfg = await resolveResend(serviceKeys, env, logger);
      return !!cfg;
    },

    async sendEmail(to: string, subject: string, htmlBody: string) {
      return send(to, subject, htmlBody, 'custom');
    },

    async sendBulkEmail(emails: string[], subject: string, htmlBody: string) {
      const cfg = await resolveResend(serviceKeys, env, logger);
      if (!cfg) {
        logger.warn('email.bulk_not_configured');
        return { sent: 0, failed: emails.length };
      }
      let sent = 0, failed = 0;
      // Send in batches of 10
      for (let i = 0; i < emails.length; i += 10) {
        const batch = emails.slice(i, i + 10);
        const results = await Promise.allSettled(
          batch.map(email => send(email, subject, htmlBody, 'admin_broadcast')),
        );
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.success) sent++; else failed++;
        }
      }
      logger.info('email.bulk_done', { total: emails.length, sent, failed });
      return { sent, failed };
    },

    async sendWelcome(to, name, exam, credits, language) {
      const subject = language === 'hi'
        ? `नेक्सीग्रेट में स्वागत है, ${name}!`
        : `Welcome to Nexigrate, ${name}!`;
      const greeting = language === 'hi' ? 'नमस्ते' : 'Hi';
      const body = language === 'hi'
        ? `<h1 style="color:#1C1917;font-size:24px;margin:0 0 16px">${greeting} ${name},</h1>
           <p style="font-size:16px;line-height:1.6;color:#44403C">नेक्सीग्रेट में आपका स्वागत है — ${exam.toUpperCase()} की तैयारी के लिए आपकी AI साथी।</p>
           <p style="font-size:16px;line-height:1.6;color:#44403C">शुरू करने के लिए <strong>${credits} फ़्री क्रेडिट</strong> मिले हैं — पहला अध्याय तुरंत पढ़िए, MCQ कीजिए, संदेह पूछिए।</p>
           ${ctaButton('शुरू करें', 'https://app.nexigrate.com/dashboard')}`
        : `<h1 style="color:#1C1917;font-size:24px;margin:0 0 16px">${greeting} ${name},</h1>
           <p style="font-size:16px;line-height:1.6;color:#44403C">Welcome to Nexigrate — your AI companion for ${exam.toUpperCase()} preparation.</p>
           <p style="font-size:16px;line-height:1.6;color:#44403C">You have <strong>${credits} free credits</strong> to start — read your first chapter, take MCQs, ask doubts.</p>
           ${ctaButton('Start Learning', 'https://app.nexigrate.com/dashboard')}`;
      return sendBoolean(to, subject, baseTemplate(body), 'welcome');
    },

    async sendStreakReminder(to, name, streak, language) {
      const subject = language === 'hi'
        ? `🔥 ${name}, आपकी ${streak}-दिन की लकीर खतरे में!`
        : `🔥 ${name}, your ${streak}-day streak is at risk!`;
      const body = language === 'hi'
        ? `<h1 style="color:#1C1917;font-size:24px">${name}, अभी पढ़ाई कीजिए!</h1>
           <p style="font-size:16px;line-height:1.6">आपकी <strong>${streak} दिन की लगातार पढ़ाई</strong> टूटने वाली है। बस 5 मिनट दीजिए — एक अध्याय या एक MCQ काफ़ी है।</p>
           ${ctaButton('आज की पढ़ाई करें', 'https://app.nexigrate.com/dashboard')}`
        : `<h1 style="color:#1C1917;font-size:24px">${name}, study now to keep your streak!</h1>
           <p style="font-size:16px;line-height:1.6">Your <strong>${streak}-day streak</strong> is at risk. Just 5 minutes — a chapter or one MCQ — keeps it alive.</p>
           ${ctaButton('Study Now', 'https://app.nexigrate.com/dashboard')}`;
      return sendBoolean(to, subject, baseTemplate(body), 'streak_reminder');
    },

    async sendPlanExpiry(to, name, plan, expiresAt, language) {
      const expiryDate = new Date(expiresAt).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const subject = language === 'hi'
        ? `${plan} सदस्यता ${expiryDate} को समाप्त हो रही है`
        : `Your ${plan} plan expires on ${expiryDate}`;
      const body = language === 'hi'
        ? `<h1 style="color:#1C1917;font-size:24px">${name}, सदस्यता रिन्यू कीजिए</h1>
           <p style="font-size:16px;line-height:1.6">आपकी <strong>${plan}</strong> सदस्यता <strong>${expiryDate}</strong> को समाप्त होगी। रिन्यू करने पर अनलिमिटेड MCQ, AI ट्यूटर, और मॉक टेस्ट जारी रहेंगे।</p>
           ${ctaButton('अभी रिन्यू करें', 'https://app.nexigrate.com/upgrade')}`
        : `<h1 style="color:#1C1917;font-size:24px">${name}, time to renew</h1>
           <p style="font-size:16px;line-height:1.6">Your <strong>${plan}</strong> plan expires on <strong>${expiryDate}</strong>. Renew to keep unlimited MCQs, AI tutor, and mock tests.</p>
           ${ctaButton('Renew Now', 'https://app.nexigrate.com/upgrade')}`;
      return sendBoolean(to, subject, baseTemplate(body), 'plan_expiry');
    },

    async sendPaymentSuccess(to, name, plan, expiresAt, amount) {
      const subject = `Payment confirmed — ${plan} plan active`;
      const expiryDate = new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const body = `<h1 style="color:#1C1917;font-size:24px">Thank you, ${name}!</h1>
        <p style="font-size:16px;line-height:1.6">Your <strong>${plan}</strong> plan is now active. Plan expires on <strong>${expiryDate}</strong>. Amount paid: <strong>₹${amount.toLocaleString('en-IN')}</strong>.</p>
        <p style="font-size:14px;color:#78716C">A receipt is available in your profile under Payment History.</p>
        ${ctaButton('Open Dashboard', 'https://app.nexigrate.com/dashboard')}`;
      return sendBoolean(to, subject, baseTemplate(body), 'payment_receipt');
    },

    async sendCancellationConfirmation(to, name, plan, expiresAt) {
      const expiryDate = new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      const subject = `${plan} subscription cancelled — access until ${expiryDate}`;
      const body = `<h1 style="color:#1C1917;font-size:24px">${name}, your subscription is cancelled.</h1>
        <p style="font-size:16px;line-height:1.6">You'll keep <strong>${plan}</strong> access until <strong>${expiryDate}</strong>. After that, your account moves back to the Free plan automatically.</p>
        <p style="font-size:14px;color:#78716C">Changed your mind? You can resume anytime from the upgrade page.</p>
        ${ctaButton('Resume Plan', 'https://app.nexigrate.com/upgrade')}`;
      return sendBoolean(to, subject, baseTemplate(body), 'cancellation');
    },

    async sendCustom(to, subject, htmlBody) {
      return sendBoolean(to, subject, htmlBody, 'custom');
    },
  };
}

export function announcementEmailTemplate(title: string, body: string): { subject: string; html: string } {
  return {
    subject: title,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><div style="max-width:600px;margin:0 auto;padding:24px"><div style="background:#fff;padding:32px 24px;border-radius:12px;border:1px solid #E7E5E4"><h1 style="color:#1C1917;font-size:24px;margin:0 0 16px">${title}</h1><div style="font-size:16px;line-height:1.6;color:#44403C">${body}</div></div></div></body></html>`,
  };
}
