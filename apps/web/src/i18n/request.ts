import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  // For now, we use a cookie-based locale detection
  // Default to 'en', user can switch during onboarding
  const locale = 'en';

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
