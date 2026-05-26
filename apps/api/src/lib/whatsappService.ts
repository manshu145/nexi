import type { Env } from '../env.js';
import type { Logger } from '../logger.js';

export interface WhatsAppService {
  isConfigured(): boolean;
  sendMessage(phoneNumber: string, message: string): Promise<{ success: boolean; messageId?: string }>;
}

export function createWhatsAppService(env: Env, logger: Logger): WhatsAppService {
  // WhatsApp Business API via Meta Cloud API
  // Requires: WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TOKEN env vars (not yet in env.ts — graceful fallback)
  const token = (env as any).WHATSAPP_TOKEN ?? '';
  const phoneNumberId = (env as any).WHATSAPP_PHONE_NUMBER_ID ?? '';
  const configured = !!(token && token.length > 5 && phoneNumberId && phoneNumberId.length > 5);

  return {
    isConfigured() { return configured; },

    async sendMessage(phoneNumber: string, message: string) {
      if (!configured) {
        logger.warn('whatsapp.not_configured', { phoneNumber });
        return { success: false };
      }
      try {
        const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phoneNumber.replace(/[^0-9+]/g, ''),
            type: 'text',
            text: { body: message },
          }),
        });
        if (!res.ok) { const err = await res.text(); logger.error('whatsapp.send_failed', { phoneNumber, status: res.status, err }); return { success: false }; }
        const data = (await res.json()) as { messages?: { id: string }[] };
        const messageId = data.messages?.[0]?.id;
        logger.info('whatsapp.sent', { phoneNumber, messageId });
        return { success: true, messageId };
      } catch (err) {
        logger.error('whatsapp.error', { phoneNumber, error: err instanceof Error ? err.message : String(err) });
        return { success: false };
      }
    },
  };
}
