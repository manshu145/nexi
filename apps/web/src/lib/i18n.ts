'use client';

/**
 * Nexigrate i18n — Hindi + English
 *
 * When a student selects Hindi during onboarding, the ENTIRE platform
 * switches to Hindi — every button, every label, every page.
 *
 * Usage: import { t, getLanguage, setLanguage } from '~/lib/i18n';
 *        <h1>{t('dashboard.greeting', 'Good morning')}</h1>
 */

const HI: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════════
  // COMMON / GLOBAL
  // ═══════════════════════════════════════════════════════════════════
  'loading': 'लोड हो रहा है...',
  'retry': 'पुनः प्रयास करें',
  'back': 'वापस',
  'continue': 'जारी रखें',
  'save': 'सहेजें',
  'cancel': 'रद्द करें',
  'submit': 'जमा करें',
  'sign_out': 'साइन आउट',
  'sign_in': 'साइन इन',
  'start': 'शुरू करें',
  'next': 'अगला',
  'previous': 'पिछला',
  'skip': 'छोड़ें',
  'close': 'बंद करें',
  'search': 'खोजें',
  'all': 'सभी',
  'done': 'हो गया',
  'error': 'कुछ गलत हो गया',
  'no_data': 'कोई डेटा उपलब्ध नहीं',
  'see_all': 'सभी देखें',
  'learn_more': 'और जानें',
  'upgrade': 'अपग्रेड करें',
  'free': 'मुफ़्त',
  'premium': 'प्रीमियम',

  // ═══════════════════════════════════════════════════════════════════
  // SIGN IN PAGE
  // ═══════════════════════════════════════════════════════════════════
  'signin.title': 'Nexigrate में आपका स्वागत है',
  'signin.subtitle': 'अपनी पढ़ाई शुरू करने के लिए साइन इन करें',
  'signin.google': 'Google से साइन इन करें',
  'signin.terms': 'साइन इन करके आप हमारी शर्तों और गोपनीयता नीति से सहमत होते हैं',

  // ═══════════════════════════════════════════════════════════════════
  // ONBOARDING
  // ═══════════════════════════════════════════════════════════════════
  'onboarding.step': 'स्टेप',
  'onboarding.of': 'में से',

  // Step 1: Language
  'onboarding.lang.title': 'अपनी पसंदीदा भाषा चुनें',
  'onboarding.lang.subtitle': 'सभी सामग्री इस भाषा में दिखाई जाएगी',

  // Step 2: Personal
  'onboarding.personal.title': 'अपने बारे में बताएं',
  'onboarding.personal.subtitle': 'यह आपकी पढ़ाई को व्यक्तिगत बनाने में मदद करता है',
  'onboarding.personal.name': 'पूरा नाम',
  'onboarding.personal.name_placeholder': 'आपका पूरा नाम',
  'onboarding.personal.dob': 'जन्म तिथि',
  'onboarding.personal.aim': 'आपका लक्ष्य / करियर गोल',
  'onboarding.personal.aim_placeholder': 'जैसे IAS अधिकारी, डॉक्टर, इंजीनियर',

  // Step 3: Education
  'onboarding.edu.title': 'शिक्षा विवरण',
  'onboarding.edu.class': 'वर्तमान कक्षा / स्तर',
  'onboarding.edu.board': 'बोर्ड',
  'onboarding.edu.school': 'स्कूल / कॉलेज का नाम',
  'onboarding.edu.school_placeholder': 'वैकल्पिक',
  'onboarding.edu.district': 'जिला',
  'onboarding.edu.state': 'राज्य',
  'onboarding.edu.select': 'चुनें...',

  // Step 4: Exam
  'onboarding.exam.title': 'आप किस परीक्षा की तैयारी कर रहे हैं?',
  'onboarding.exam.subtitle': 'अपनी मुख्य परीक्षा चुनें। बाद में और जोड़ सकते हैं।',
  'onboarding.exam.next_btn': 'अगला: AI मूल्यांकन',

  // Step 5: AI Assessment
  'onboarding.assess.title': 'AI मूल्यांकन',
  'onboarding.assess.subtitle': 'इन 15 प्रश्नों का उत्तर दें ताकि हम आपकी पढ़ाई की योजना बना सकें',
  'onboarding.assess.generating': 'AI से प्रश्न बनाए जा रहे हैं...',
  'onboarding.assess.question': 'प्रश्न',
  'onboarding.assess.answered': 'उत्तर दिए',
  'onboarding.assess.skip': 'मूल्यांकन छोड़ें',
  'onboarding.assess.submit': 'जमा करें',
  'onboarding.assess.analyzing': 'विश्लेषण हो रहा है...',
  'onboarding.assess.saving': 'सहेजा जा रहा है...',
  'onboarding.assess.no_questions': 'कोई प्रश्न नहीं बन सके।',

  // ═══════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════════════
  'dashboard.greeting_morning': 'सुप्रभात',
  'dashboard.greeting_afternoon': 'नमस्ते',
  'dashboard.greeting_evening': 'शुभ संध्या',
  'dashboard.syllabus_progress': 'सिलेबस प्रगति',
  'dashboard.complete': 'पूर्ण',

  // Stats
  'dashboard.stat.streak': 'दिन स्ट्रीक',
  'dashboard.stat.topics_done': 'टॉपिक पूरे',
  'dashboard.stat.best_streak': 'बेस्ट स्ट्रीक',

  // 3 Main action cards
  'dashboard.card.ca.title': 'करंट अफेयर्स',
  'dashboard.card.ca.desc': 'दैनिक अपडेट — हर श्रेणी में 6-8 आइटम, परीक्षा-केंद्रित',
  'dashboard.card.study.title': 'परीक्षा की तैयारी',
  'dashboard.card.study.desc': 'सिलेबस → अध्याय → मॉक टेस्ट → फाइनल टेस्ट',
  'dashboard.card.nexi.title': 'Nexi AI',
  'dashboard.card.nexi.desc': 'डाउट सॉल्विंग, प्रॉब्लम हेल्प, स्टडी असिस्टेंट',

  // Profile section
  'dashboard.profile': 'प्रोफ़ाइल',
  'dashboard.credits': 'क्रेडिट',
  'dashboard.usage': 'उपयोग',
  'dashboard.progress': 'प्रगति',
  'dashboard.upcoming_exams': 'आगामी परीक्षाएं',

  // ═══════════════════════════════════════════════════════════════════
  // CURRENT AFFAIRS
  // ═══════════════════════════════════════════════════════════════════
  'ca.title': 'करंट अफेयर्स',
  'ca.loading': 'करंट अफेयर्स लोड हो रहे हैं...',
  'ca.no_items': 'कोई आइटम नहीं मिला। "सभी" चुनें।',
  'ca.exam_relevance': 'परीक्षा प्रासंगिकता',

  // Categories
  'ca.cat.polity': 'राजनीति',
  'ca.cat.economy': 'अर्थव्यवस्था',
  'ca.cat.science': 'विज्ञान',
  'ca.cat.international': 'अंतर्राष्ट्रीय',
  'ca.cat.sports': 'खेल',
  'ca.cat.environment': 'पर्यावरण',
  'ca.cat.defence': 'रक्षा',
  'ca.cat.technology': 'प्रौद्योगिकी',
  'ca.cat.national': 'राष्ट्रीय',
  'ca.cat.awards': 'पुरस्कार',

  // ═══════════════════════════════════════════════════════════════════
  // STUDY FLOW
  // ═══════════════════════════════════════════════════════════════════
  'study.title': 'पढ़ाई की योजना',
  'study.loading': 'स्टडी प्लान लोड हो रहा है...',
  'study.level': 'स्तर',
  'study.complete_pct': 'पूर्ण',
  'study.generating_syllabus': 'आपका व्यक्तिगत सिलेबस बनाया जा रहा है...',
  'study.final_test_btn': 'फाइनल टेस्ट दें (50 प्रश्न)',
  'study.final_test_unlock': 'फाइनल टेस्ट अनलॉक करने के लिए कम से कम 80% टॉपिक पूरे करें।',

  // Topic status
  'study.status.locked': 'लॉक',
  'study.status.available': 'शुरू करें',
  'study.status.in_progress': 'जारी',
  'study.status.mock_passed': 'मॉक पास',
  'study.status.completed': 'पूर्ण',

  // Chapter reader
  'chapter.loading': 'AI से अध्याय बनाया जा रहा है...',
  'chapter.loading_sub': 'इसमें कुछ सेकंड लग सकते हैं',
  'chapter.page': 'पेज',
  'chapter.key_points': 'मुख्य बिंदु',
  'chapter.summary': 'सारांश',
  'chapter.take_mock': 'मॉक टेस्ट दें (पास करने के लिए 80%)',
  'chapter.back_to_study': 'पढ़ाई पर वापस',

  // Mock test
  'mock.title': 'मॉक टेस्ट',
  'mock.loading': 'मॉक टेस्ट बनाया जा रहा है...',
  'mock.answered': 'उत्तर दिए',
  'mock.score': 'स्कोर',
  'mock.submit_test': 'टेस्ट जमा करें',
  'mock.submitting': 'जमा हो रहा है...',
  'mock.passed': 'पास! %s% (80% जरूरी)',
  'mock.not_passed': 'पास नहीं: %s% (80% चाहिए)',
  'mock.passed_msg': 'टॉपिक अनलॉक! अगले टॉपिक पर जा सकते हैं।',
  'mock.not_passed_msg': 'नीचे एक्सप्लेनेशन देखें और फिर से प्रयास करें।',
  'mock.explanation': 'व्याख्या:',
  'mock.retry': 'फिर से',
  'mock.back_study': 'पढ़ाई पर वापस',

  // Final test
  'final.title': 'फाइनल टेस्ट',
  'final.subtitle': '50 प्रश्न — सम्पूर्ण सिलेबस',
  'final.loading': 'फाइनल टेस्ट बनाया जा रहा है...',

  // ═══════════════════════════════════════════════════════════════════
  // NEXI AI CHATBOT
  // ═══════════════════════════════════════════════════════════════════
  'nexi.title': 'Nexi AI',
  'nexi.subtitle': 'आपका स्टडी असिस्टेंट',
  'nexi.clear': 'मिटाएं',
  'nexi.dashboard': 'डैशबोर्ड',
  'nexi.empty_title': 'नमस्ते! मैं Nexi हूं',
  'nexi.empty_desc': 'आपका AI स्टडी असिस्टेंट। मुझसे कुछ भी पूछें — विषय, परीक्षा की तैयारी, डाउट क्लियरिंग, या स्टडी स्ट्रैटेजी।',
  'nexi.input_placeholder': 'कुछ भी पूछें...',
  'nexi.clear_confirm': 'पूरा चैट इतिहास मिटाएं?',
  'nexi.error_response': 'माफ करें, मैं इसे प्रोसेस नहीं कर सका। कृपया फिर से प्रयास करें।',

  // Suggestions
  'nexi.sug.constitution': 'भारतीय संविधान समझाएं',
  'nexi.sug.newton': 'न्यूटन के गति के नियम क्या हैं?',
  'nexi.sug.upsc': 'UPSC की तैयारी के टिप्स',
  'nexi.sug.photosynthesis': 'प्रकाश संश्लेषण सरल भाषा में',
  'nexi.sug.current': 'इस हफ्ते के करंट अफेयर्स',
  'nexi.sug.quadratic': 'द्विघात समीकरण कैसे हल करें?',

  // ═══════════════════════════════════════════════════════════════════
  // MCQ DAILY
  // ═══════════════════════════════════════════════════════════════════
  'mcq.title': 'दैनिक MCQ',
  'mcq.loading': 'आज के प्रश्न लोड हो रहे हैं...',
  'mcq.question': 'प्रश्न',
  'mcq.of': 'में से',
  'mcq.submit': 'सभी उत्तर जमा करें',
  'mcq.result': 'परिणाम',
  'mcq.score': 'आपका स्कोर',
  'mcq.credits_earned': 'क्रेडिट मिले',
  'mcq.review': 'उत्तर समीक्षा',
  'mcq.correct': 'सही',
  'mcq.incorrect': 'गलत',
  'mcq.explanation': 'व्याख्या',
  'mcq.dashboard': 'डैशबोर्ड पर वापस',

  // ═══════════════════════════════════════════════════════════════════
  // UPGRADE / BILLING
  // ═══════════════════════════════════════════════════════════════════
  'upgrade.title': 'प्रीमियम में अपग्रेड करें',
  'upgrade.subtitle': 'असीमित एक्सेस पाएं',
  'upgrade.monthly': 'मासिक',
  'upgrade.yearly': 'वार्षिक',
  'upgrade.per_month': '/महीना',
  'upgrade.subscribe': 'सब्सक्राइब करें',
  'upgrade.features': 'इसमें शामिल है',

  // ═══════════════════════════════════════════════════════════════════
  // MOBILE NAVIGATION
  // ═══════════════════════════════════════════════════════════════════
  'nav.home': 'होम',
  'nav.study': 'पढ़ाई',
  'nav.affairs': 'अफेयर्स',
  'nav.ai': 'AI',
  'nav.profile': 'प्रोफ़ाइल',
};

/**
 * Translate a key. Returns Hindi string if language is 'hi',
 * otherwise returns the fallback (which should be English text).
 */
export function t(key: string, fallback?: string): string {
  if (typeof window === 'undefined') return fallback ?? key;
  const lang = localStorage.getItem('nexi.language') ?? 'en';
  if (lang === 'hi' && HI[key]) {
    return HI[key]!;
  }
  return fallback ?? key;
}

/**
 * Get current language code.
 */
export function getLanguage(): 'en' | 'hi' {
  if (typeof window === 'undefined') return 'en';
  return (localStorage.getItem('nexi.language') as 'en' | 'hi') ?? 'en';
}

/**
 * Set language persistently.
 */
export function setLanguage(code: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('nexi.language', code);
  // Force re-render by dispatching a custom event
  window.dispatchEvent(new CustomEvent('nexi-language-change', { detail: code }));
}

/**
 * Hook-friendly: subscribe to language changes.
 * Use this in a useEffect to trigger re-renders on language switch.
 */
export function onLanguageChange(callback: (lang: string) => void): () => void {
  const handler = (e: Event) => callback((e as CustomEvent).detail);
  window.addEventListener('nexi-language-change', handler);
  return () => window.removeEventListener('nexi-language-change', handler);
}
