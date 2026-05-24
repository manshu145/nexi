'use client';

/**
 * Minimal i18n system for Hindi + English.
 * Reads language preference from localStorage and provides a `t()` function.
 */

export type Lang = 'en' | 'hi';

const translations: Record<string, Record<Lang, string>> = {
  // Navigation
  'nav.home': { en: 'Home', hi: 'होम' },
  'nav.practice': { en: 'Practice', hi: 'अभ्यास' },
  'nav.library': { en: 'Library', hi: 'लाइब्रेरी' },
  'nav.today': { en: 'Today', hi: 'आज' },
  'nav.progress': { en: 'Progress', hi: 'प्रगति' },
  'nav.profile': { en: 'Profile', hi: 'प्रोफ़ाइल' },

  // Dashboard
  'dash.greeting.morning': { en: 'Good morning', hi: 'सुप्रभात' },
  'dash.greeting.afternoon': { en: 'Good afternoon', hi: 'नमस्कार' },
  'dash.greeting.evening': { en: 'Good evening', hi: 'शुभ संध्या' },
  'dash.title': { en: "Today's study slate", hi: 'आज का अध्ययन' },
  'dash.mcq.title': { en: 'Daily MCQ · 10 questions', hi: 'दैनिक MCQ · 10 प्रश्न' },
  'dash.mcq.subtitle': { en: 'Take today\'s questions, earn credits.', hi: 'आज के प्रश्न हल करें, क्रेडिट कमाएं।' },
  'dash.mcq.cta': { en: 'Start daily MCQ', hi: 'दैनिक MCQ शुरू करें' },
  'dash.mcq.pass': { en: 'Pass with 7/10 or more to earn', hi: '7/10 या अधिक स्कोर करें और कमाएं' },
  'dash.credits': { en: 'Credits balance', hi: 'क्रेडिट बैलेंस' },
  'dash.streak': { en: 'Daily streak', hi: 'दैनिक स्ट्रीक' },
  'dash.streak.days': { en: 'days', hi: 'दिन' },
  'dash.streak.best': { en: 'Best', hi: 'सर्वश्रेष्ठ' },
  'dash.recommended': { en: 'Recommended for you', hi: 'आपके लिए सुझाव' },
  'dash.study': { en: 'Study Chapter', hi: 'अध्याय पढ़ें' },
  'dash.mocktest': { en: 'Mock Test', hi: 'मॉक टेस्ट' },
  'dash.nexipedia': { en: 'Nexipedia', hi: 'नेक्सिपीडिया' },
  'dash.ca': { en: 'Current Affairs', hi: 'समसामयिकी' },
  'dash.signout': { en: 'Sign out', hi: 'लॉग आउट' },
  'dash.upgrade': { en: 'Upgrade', hi: 'अपग्रेड' },

  // Onboarding
  'onboard.lang.title': { en: 'Choose your language', hi: 'अपनी भाषा चुनें' },
  'onboard.lang.sub': { en: 'The entire app will be in your chosen language.', hi: 'पूरा ऐप आपकी चुनी हुई भाषा में होगा।' },
  'onboard.exam.title': { en: 'Which exam are you preparing for?', hi: 'आप किस परीक्षा की तैयारी कर रहे हैं?' },
  'onboard.exam.sub': { en: 'We tailor everything to your target exam.', hi: 'हम सब कुछ आपकी परीक्षा के अनुसार बनाते हैं।' },
  'onboard.test.title': { en: 'Quick assessment', hi: 'त्वरित मूल्यांकन' },
  'onboard.test.sub': { en: 'Answer a few questions so we can understand your level.', hi: 'कुछ प्रश्नों के उत्तर दें ताकि हम आपका स्तर समझ सकें।' },
  'onboard.result.title': { en: 'Your study plan is ready!', hi: 'आपका अध्ययन प्लान तैयार है!' },
  'onboard.continue': { en: 'Continue', hi: 'जारी रखें' },
  'onboard.start_test': { en: 'Start Assessment', hi: 'मूल्यांकन शुरू करें' },
  'onboard.go_dashboard': { en: 'Go to Dashboard', hi: 'डैशबोर्ड पर जाएं' },

  // MCQ
  'mcq.question': { en: 'Question', hi: 'प्रश्न' },
  'mcq.of': { en: 'of', hi: 'में से' },
  'mcq.next': { en: 'Next', hi: 'अगला' },
  'mcq.prev': { en: 'Previous', hi: 'पिछला' },
  'mcq.submit': { en: 'Submit answers', hi: 'उत्तर जमा करें' },
  'mcq.loading': { en: 'Loading questions...', hi: 'प्रश्न लोड हो रहे हैं...' },

  // Library / Kindle
  'lib.title': { en: 'Your Library', hi: 'आपकी लाइब्रेरी' },
  'lib.chapters': { en: 'Study Chapters', hi: 'अध्याय' },
  'lib.generate': { en: 'Generate Chapter', hi: 'अध्याय बनाएं' },
  'kindle.listen': { en: 'Listen', hi: 'सुनें' },
  'kindle.visualize': { en: 'Visualize', hi: 'चित्र देखें' },
  'kindle.swipe': { en: 'Swipe to turn page', hi: 'पेज पलटने के लिए स्वाइप करें' },

  // Nexipedia
  'nex.title': { en: 'Nexipedia', hi: 'नेक्सिपीडिया' },
  'nex.search': { en: 'Search any topic...', hi: 'कोई भी विषय खोजें...' },
  'nex.explore': { en: 'Explore', hi: 'खोजें' },
  'nex.related': { en: 'Related Topics', hi: 'संबंधित विषय' },
  'nex.video': { en: 'Watch Video', hi: 'वीडियो देखें' },

  // Current Affairs
  'ca.title': { en: "Today's Current Affairs", hi: 'आज की समसामयिकी' },
  'ca.quiz': { en: 'Take Quiz', hi: 'क्विज़ दें' },
  'ca.winner': { en: "Yesterday's fastest", hi: 'कल का सबसे तेज़' },

  // Chat
  'chat.title': { en: 'AI Mentor', hi: 'AI मेंटर' },
  'chat.placeholder': { en: 'Ask anything about your studies...', hi: 'अपनी पढ़ाई के बारे में कुछ भी पूछें...' },

  // Common
  'common.loading': { en: 'Loading...', hi: 'लोड हो रहा है...' },
  'common.error': { en: 'Something went wrong', hi: 'कुछ गड़बड़ हुई' },
  'common.retry': { en: 'Try again', hi: 'फिर कोशिश करें' },
  'common.back': { en: 'Back', hi: 'वापस' },
  'common.save': { en: 'Save', hi: 'सहेजें' },
  'common.cancel': { en: 'Cancel', hi: 'रद्द करें' },
};

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  return (localStorage.getItem('nexigrate:lang') as Lang) || 'en';
}

export function setLang(lang: Lang): void {
  localStorage.setItem('nexigrate:lang', lang);
}

export function t(key: string, lang?: Lang): string {
  const l = lang ?? getLang();
  return translations[key]?.[l] ?? translations[key]?.['en'] ?? key;
}
