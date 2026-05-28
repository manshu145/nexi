import type { Env } from '../env.js';
import type { Logger } from '../logger.js';

export interface EmailService {
  sendEmail(to: string, subject: string, htmlBody: string): Promise<{ success: boolean; id?: string }>;
  sendBulkEmail(emails: string[], subject: string, htmlBody: string): Promise<{ sent: number; failed: number }>;
  sendWelcome(to: string, name: string, exam: string, credits: number, language: 'en' | 'hi'): Promise<boolean>;
  sendStreakReminder(to: string, name: string, streak: number, language: 'en' | 'hi'): Promise<boolean>;
  sendPlanExpiry(to: string, name: string, plan: string, expiresAt: string, language: 'en' | 'hi'): Promise<boolean>;
  sendPaymentSuccess(to: string, name: string, plan: string, expiresAt: string, amount: number): Promise<boolean>;
  sendCustom(to: string, subject: string, htmlBody: string): Promise<boolean>;
}

function baseTemplate(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><div style="max-width:600px;margin:0 auto;padding:24px"><div style="text-align:center;padding:16px 0;border-bottom:3px solid #D97706"><img src="https://app.nexigrate.com/logo.png" alt="Nexigrate" width="120" style="display:inline-block"></div><div style="background:#fff;padding:32px 24px;border-radius:12px;margin-top:16px;border:1px solid #E7E5E4">${content}</div><div style="text-align:center;padding:24px 0;color:#78716C;font-size:12px"><p>&copy; 2026 Nexigrate &middot; <a href="https://app.nexigrate.com/unsubscribe" style="color:#78716C">Unsubscribe</a> &middot; <a href="https://nexigrate.com/privacy" style="color:#78716C">Privacy Policy</a></p></div></div></body></html>`;
}

function ctaButton(text: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0"><a href="${url}" style="display:inline-block;background:#D97706;color:#fff;padding:14px 32px;border-radius:99px;text-decoration:none;font-weight:600;font-size:14px">${text}</a></div>`;
}

export function createEmailService(env: Env, logger: Logger): EmailService {
  const apiKey = env.RESEND_API_KEY;
  const configured = !!(apiKey && apiKey.length > 5);
  const FROM = 'Nexigrate <hello@nexigrate.com>';

  async function send(to: string, subject: string, html: string): Promise<boolean> {
    if (!configured) {
      logger.warn('email.not_configured', { to, subject });
      return false;
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [to], subject, html, reply_to: 'support@nexigrate.com' }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        logger.error('email.send_failed', { to, subject, status: res.status, error: err.slice(0, 200) });
        return false;
      }
      logger.info('email.sent', { to, subject });
      return true;
    } catch (err) {
      logger.error('email.send_error', { to, subject, error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

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
          body: JSON.stringify({ from: FROM, to: [to], subject, html: htmlBody }),
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

    async sendWelcome(to, name, exam, credits, language) {
      const isHi = language === 'hi';
      const subject = isHi
        ? `Nexigrate में आपका स्वागत है! 🎉 आपके ${credits} क्रेडिट्स तैयार हैं`
        : `Welcome to Nexigrate! 🎉 Your ${credits} credits are ready`;
      const content = isHi
        ? `<h2 style="color:#1C1917;margin:0 0 16px">नमस्ते ${name}! 🎉</h2><p style="color:#44403C;line-height:1.6">Nexigrate में आपका स्वागत है! आपको <strong>${credits} क्रेडिट्स</strong> मिले हैं।</p><p style="color:#44403C;line-height:1.6">आपका चयनित परीक्षा: <strong>${exam}</strong></p><p style="color:#44403C;line-height:1.6;margin-top:16px">अभी शुरू करें:</p><ul style="color:#44403C;line-height:2"><li>📖 AI-powered अध्याय पढ़ें</li><li>📰 दैनिक करंट अफेयर्स</li><li>🤖 Nexi AI से पूछें</li></ul>${ctaButton('पढ़ाई शुरू करें →', 'https://app.nexigrate.com/dashboard')}`
        : `<h2 style="color:#1C1917;margin:0 0 16px">Hello ${name}! 🎉</h2><p style="color:#44403C;line-height:1.6">Welcome to Nexigrate! You've received <strong>${credits} credits</strong> to start your journey.</p><p style="color:#44403C;line-height:1.6">Your chosen exam: <strong>${exam}</strong></p><p style="color:#44403C;line-height:1.6;margin-top:16px">Here's what to do first:</p><ul style="color:#44403C;line-height:2"><li>📖 Read AI-powered chapters</li><li>📰 Daily Current Affairs</li><li>🤖 Ask Nexi AI anything</li></ul>${ctaButton('Start Learning →', 'https://app.nexigrate.com/dashboard')}`;
      return send(to, subject, baseTemplate(content));
    },

    async sendStreakReminder(to, name, streak, language) {
      const isHi = language === 'hi';
      const subject = isHi ? `🔥 ${name}, आपका ${streak}-day streak टूटने वाला है!` : `🔥 ${name}, your ${streak}-day streak is about to break!`;
      const content = isHi
        ? `<h2 style="color:#1C1917;margin:0 0 16px">🔥 ${name}, वापस आओ!</h2><p style="color:#44403C;line-height:1.6">आपका <strong>${streak} दिनों</strong> का streak आज टूट जाएगा अगर आप app नहीं खोलते।</p><p style="color:#44403C">बस 5 मिनट — एक chapter पढ़ें या quiz दें!</p>${ctaButton('Streak बचाओ →', 'https://app.nexigrate.com/dashboard')}`
        : `<h2 style="color:#1C1917;margin:0 0 16px">🔥 ${name}, come back!</h2><p style="color:#44403C;line-height:1.6">Your <strong>${streak}-day streak</strong> will break today if you don't visit.</p><p style="color:#44403C">Just 5 minutes — read a chapter or take a quiz!</p>${ctaButton('Save Your Streak →', 'https://app.nexigrate.com/dashboard')}`;
      return send(to, subject, baseTemplate(content));
    },

    async sendPlanExpiry(to, name, plan, expiresAt, language) {
      const isHi = language === 'hi';
      const subject = isHi ? `⚠️ ${name}, आपका ${plan} plan 3 दिन में expire होगा` : `⚠️ ${name}, your ${plan} plan expires in 3 days`;
      const content = isHi
        ? `<h2 style="color:#1C1917;margin:0 0 16px">⚠️ Plan Expiry Notice</h2><p style="color:#44403C;line-height:1.6">${name}, आपका <strong>${plan}</strong> plan <strong>${expiresAt}</strong> को expire हो रहा है।</p><p style="color:#44403C">Renew करें और अपनी पढ़ाई जारी रखें!</p>${ctaButton('Renew करें →', 'https://app.nexigrate.com/upgrade')}`
        : `<h2 style="color:#1C1917;margin:0 0 16px">⚠️ Plan Expiry Notice</h2><p style="color:#44403C;line-height:1.6">${name}, your <strong>${plan}</strong> plan expires on <strong>${expiresAt}</strong>.</p><p style="color:#44403C">Renew now to keep all features!</p>${ctaButton('Renew Now →', 'https://app.nexigrate.com/upgrade')}`;
      return send(to, subject, baseTemplate(content));
    },

    async sendPaymentSuccess(to, name, plan, expiresAt, amount) {
      const subject = `✅ Payment Successful — ${plan} Plan Activated!`;
      const content = `<h2 style="color:#1C1917;margin:0 0 16px">✅ Payment Confirmed!</h2><p style="color:#44403C;line-height:1.6">Hi ${name}, your payment of ₹${amount} was successful.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;border-bottom:1px solid #E7E5E4;color:#78716C">Plan</td><td style="padding:8px;border-bottom:1px solid #E7E5E4;color:#1C1917;font-weight:600">${plan}</td></tr><tr><td style="padding:8px;border-bottom:1px solid #E7E5E4;color:#78716C">Valid Until</td><td style="padding:8px;border-bottom:1px solid #E7E5E4;color:#1C1917;font-weight:600">${expiresAt}</td></tr><tr><td style="padding:8px;color:#78716C">Amount</td><td style="padding:8px;color:#1C1917;font-weight:600">₹${amount}</td></tr></table>${ctaButton('Go to Dashboard →', 'https://app.nexigrate.com/dashboard')}`;
      return send(to, subject, baseTemplate(content));
    },

    async sendCustom(to, subject, htmlBody) {
      return send(to, subject, baseTemplate(htmlBody));
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
