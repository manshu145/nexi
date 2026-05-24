'use client';

import { useCallback, useEffect, useState } from 'react';
import { t as translate, getLanguage, onLanguageChange } from './i18n';

/**
 * React hook for i18n. Returns a `t()` function that re-renders
 * the component when language changes.
 *
 * Usage:
 *   const { t, lang } = useTranslation();
 *   <h1>{t('dashboard.card.ca.title', 'Current Affairs')}</h1>
 */
export function useTranslation() {
  const [lang, setLang] = useState<'en' | 'hi'>('en');

  useEffect(() => {
    setLang(getLanguage());
    const unsubscribe = onLanguageChange((newLang) => {
      setLang(newLang as 'en' | 'hi');
    });
    return unsubscribe;
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      // Access `lang` to create dependency for re-renders
      if (lang === 'hi') {
        return translate(key, fallback);
      }
      return fallback ?? key;
    },
    [lang],
  );

  return { t, lang };
}
