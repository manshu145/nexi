/**
 * Supported platform languages.
 *
 * v1: content is generated in Hindi + English only. The language preference
 * drives which variant the student sees first. Additional languages can be
 * added here as content pipelines support them.
 */

export type PlatformLanguage = 'hi' | 'en' | 'hinglish';

export interface LanguageOption {
  id: PlatformLanguage;
  name: string;
  nativeName: string;
}

export const LANGUAGES: readonly LanguageOption[] = [
  { id: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { id: 'en', name: 'English', nativeName: 'English' },
  { id: 'hinglish', name: 'Hinglish', nativeName: 'Hinglish (हिंदी + English)' },
] as const;

export const DEFAULT_LANGUAGE: PlatformLanguage = 'hinglish';
