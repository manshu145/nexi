/**
 * Detect the user's preferred locale on the client.
 *
 * Most pages live inside `NextIntlClientProvider` and should use the
 * `useTranslations` hook directly. This helper exists for the small number
 * of pages that render *outside* that provider's tree -- specifically:
 *
 *   - app/error.tsx          (Next.js error boundary; the provider may have
 *                             been the thing that crashed)
 *   - app/not-found.tsx      (rendered before the locale-aware layout in
 *                             some Next.js routing edge cases)
 *   - app/offline/page.tsx   (served as a fallback by the service worker
 *                             when the network is down -- next-intl's
 *                             server config can't be reached)
 *   - app/verify-phone       (sits in the auth shell, which deliberately
 *                             skips the i18n provider for fastest first
 *                             paint on signin)
 *
 * For those, this helper reads the same `nexigrate-language` cookie that
 * the i18n request config writes, with localStorage as a secondary
 * fallback (the language picker writes both for redundancy). Defaults to
 * 'en' when neither is set or when called during SSR.
 */
export type AppLocale = 'en' | 'hi';

export function getClientLocale(): AppLocale {
  if (typeof document !== 'undefined') {
    const cookieMatch = document.cookie.match(/(?:^|;\s*)nexigrate-language=(en|hi)/);
    if (cookieMatch) return cookieMatch[1] as AppLocale;
  }
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('nexigrate-language');
    if (stored === 'hi' || stored === 'en') return stored;
  }
  return 'en';
}
