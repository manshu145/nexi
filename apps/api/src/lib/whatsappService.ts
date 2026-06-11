import type { Env } from '../env.js';
import type { Logger } from '../logger.js';
import { getWhatsAppConfig, type ServiceKeyStore } from './serviceKeyStore.js';

export interface WhatsAppService {
  isConfigured(): Promise<boolean>;
  sendMessage(phoneNumber: string, message: string): Promise<{ success: boolean; messageId?: string }>;
}

/**
 * WhatsApp Business API (Meta Cloud) wrapper.
 *
 * PR-37: now optionally accepts a `ServiceKeyStore` so the founder can
 * rotate WhatsApp token + phone-number-id from /admin/service-keys
 * without redeploying. The store is optional so callers wired before
 * PR-37 (createWhatsAppService(env, logger)) keep their env-only
 * behaviour as a fallback.
 */
export function createWhatsAppService(env: Env, logger: Logger, serviceKeys?: ServiceKeyStore): WhatsAppService {

  /**
   * Resolve token + phoneNumberId at call time so admin rotations take
   * effect immediately without a Cloud Run instance restart.
   */
  async function resolve() {
    if (serviceKeys) {
      const cfg = await getWhatsAppConfig(serviceKeys, env);
      if (cfg) return cfg;
    }
    const token = env.WHATSAPP_TOKEN ?? '';
    const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID ?? '';
    if (token.length > 5 && phoneNumberId.length > 5) return { token, phoneNumberId };
    return null;
  }

  return {
    async isConfigured() {
      return (await resolve()) !== null;
    },

    async sendMessage(phoneNumber: string, message: string) {
      const cfg = await resolve();
      if (!cfg) {
        logger.warn('whatsapp.not_configured', { phoneNumber });
        return { success: false };
      }
      try {
        const url = `https://graph.facebook.com/v18.0/${cfg.phoneNumberId}/messages`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phoneNumber.replace(/[^0-9+]/g, ''),
            type: 'text',
            text: { body: message },
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          logger.error('whatsapp.send_failed', { phoneNumber, status: res.status, err });
          return { success: false };
        }
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
