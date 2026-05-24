'use client';

/**
 * Simple i18n for Hindi + English.
 * Reads from localStorage (set during onboarding).
 * If Hindi is selected, all UI strings change.
 */

const HINDI_STRINGS: Record<string, string> = {
  // Dashboard
  'dashboard.title': 'डैशबोर्ड',
  'dashboard.credits': 'क्रेडिट',
  'dashboard.streak': 'स्ट्रीक',
  'dashboard.accuracy': 'सटीकता',
  'dashboard.next_exam': 'अगली परीक्षा',
  'dashboard.practice': 'अभ्यास',
  'dashboard.daily_mcq': 'दैनिक MCQ · 10 प्रश्न',
  'dashboard.mock_tests': 'मॉक टेस्ट',
  'dashboard.long_form': 'दीर्घ उत्तर',
  'dashboard.library': 'पुस्तकालय',
  'dashboard.chapters': 'अध्याय',
  'dashboard.nexipedia': 'नेक्सिपीडिया',
  'dashboard.guides': 'गाइड',
  'dashboard.learn': 'सीखें',
  'dashboard.daily': 'दैनिक',
  'dashboard.current_affairs': 'करंट अफेयर्स',
  'dashboard.earn_credits': 'क्रेडिट कमाएं',
  'dashboard.refer': 'दोस्त को रेफर करें',

  // Navigation
  'nav.home': 'होम',
  'nav.mcq': 'MCQ',
  'nav.library': 'पुस्तकालय',
  'nav.today': 'आज',
  'nav.progress': 'प्रगति',

  // Common
  'common.loading': 'लोड हो रहा है...',
  'common.retry': 'पुनः प्रयास',
  'common.back': 'वापस',
  'common.continue': 'जारी रखें',
  'common.save': 'सहेजें',
  'common.sign_out': 'साइन आउट',
  'common.listen': 'सुनें',
  'common.stop': 'रुकें',
  'common.visualize': 'विज़ुअलाइज़',

  // Reader
  'reader.cover': 'कवर',
  'reader.end': 'समाप्त',
  'reader.prev': '← पिछला',
  'reader.next': 'अगला →',
  'reader.library': 'पुस्तकालय',
  'reader.mark_read': 'पढ़ा हुआ चिह्नित करें',
  'reader.take_test': 'टेस्ट दें',
  'reader.swipe_hint': 'पढ़ने के लिए बाएं स्वाइप करें',

  // Profile
  'profile.title': 'प्रोफ़ाइल',
  'profile.name': 'पूरा नाम',
  'profile.dob': 'जन्म तिथि',
  'profile.aim': 'लक्ष्य',
  'profile.class': 'कक्षा',
  'profile.board': 'बोर्ड',
  'profile.school': 'स्कूल',
  'profile.edit': 'संपादित करें',

  // Onboarding
  'onboarding.language': 'अपनी भाषा चुनें',
  'onboarding.personal': 'अपने बारे में बताएं',
  'onboarding.education': 'शिक्षा विवरण',
  'onboarding.exam': 'आप किस परीक्षा की तैयारी कर रहे हैं?',
  'onboarding.start': 'शुरू करें',
};

export function t(key: string, fallback?: string): string {
  if (typeof window === 'undefined') return fallback ?? key;
  const lang = localStorage.getItem('nexi.language') ?? 'en';
  if (lang === 'hi' && HINDI_STRINGS[key]) {
    return HINDI_STRINGS[key]!;
  }
  return fallback ?? key;
}

export function getLanguage(): string {
  if (typeof window === 'undefined') return 'en';
  return localStorage.getItem('nexi.language') ?? 'en';
}

export function setLanguage(code: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('nexi.language', code);
}
