'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '~/lib/userStore';

/**
 * PR-41: First-time onboarding tour.
 *
 * Shows a guided walkthrough of key dashboard features when a user
 * arrives for the first time (after completing onboarding assessment +
 * plan selection). Bilingual — checks user.language for Hindi/English.
 *
 * Tours are displayed as a series of spotlight cards with navigation.
 * Dismissal is persisted to localStorage so it never shows twice.
 */

interface TourStep {
  titleEn: string;
  titleHi: string;
  descEn: string;
  descHi: string;
  emoji: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    emoji: '👋',
    titleEn: 'Welcome to Nexigrate!',
    titleHi: 'नेक्सीग्रेट में आपका स्वागत!',
    descEn: 'Your AI-powered study companion for competitive exam prep. Let us show you around.',
    descHi: 'प्रतियोगी परीक्षा की तैयारी के लिए AI-संचालित अध्ययन साथी। चलिए आपको दिखाते हैं।',
  },
  {
    emoji: '📖',
    titleEn: 'Study Chapters',
    titleHi: 'अध्याय पढ़ें',
    descEn: 'Tap "Study" to read AI-generated chapters on any topic. Visualize, simplify, and take MCQs inline.',
    descHi: '"पढ़ाई" पर टैप करें — किसी भी विषय पर AI-जनित अध्याय पढ़ें, विज़ुअलाइज़ करें, सरल करें।',
  },
  {
    emoji: '📰',
    titleEn: 'Daily Current Affairs',
    titleHi: 'दैनिक करेंट अफेयर्स',
    descEn: 'Swipe through today\'s news reels, take the daily quiz, and compete on the leaderboard.',
    descHi: 'आज की न्यूज़ रील्स स्वाइप करें, दैनिक क्विज़ दें, और लीडरबोर्ड पर प्रतिस्पर्धा करें।',
  },
  {
    emoji: '🤖',
    titleEn: 'Ask Nexi AI',
    titleHi: 'Nexi AI से पूछें',
    descEn: 'Got a doubt? Chat with Nexi — your personal AI tutor who knows your exam syllabus.',
    descHi: 'कोई संदेह? Nexi से चैट करें — आपका व्यक्तिगत AI ट्यूटर जो आपके सिलेबस को जानता है।',
  },
  {
    emoji: '💎',
    titleEn: 'Credits & Plans',
    titleHi: 'क्रेडिट और प्लान',
    descEn: 'You start with 100 free credits. Each AI interaction uses credits. Upgrade for unlimited access!',
    descHi: 'आपको 100 फ्री क्रेडिट मिले हैं। हर AI इंटरैक्शन में क्रेडिट लगते हैं। अनलिमिटेड के लिए अपग्रेड करें!',
  },
];

const TOUR_DISMISSED_KEY = 'nexigrate-tour-dismissed';

export function OnboardingTour() {
  const { user: me } = useUser();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show tour only if:
    // 1. User exists (logged in)
    // 2. User completed onboarding (has targetExam + onboardingLevel)
    // 3. Tour hasn't been dismissed before
    // 4. Account is less than 7 days old (don't annoy existing users)
    if (!me) return;
    if (!me.targetExam || !me.onboardingLevel) return;
    if (localStorage.getItem(TOUR_DISMISSED_KEY)) return;

    const createdAt = new Date(me.createdAt).getTime();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (createdAt < sevenDaysAgo) {
      // Grandfathered user — skip tour and mark as dismissed
      localStorage.setItem(TOUR_DISMISSED_KEY, 'true');
      return;
    }

    // Show after a brief delay so the dashboard loads first
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, [me]);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(TOUR_DISMISSED_KEY, 'true');
  }, []);

  const next = useCallback(() => {
    if (step >= TOUR_STEPS.length - 1) {
      dismiss();
    } else {
      setStep(s => s + 1);
    }
  }, [step, dismiss]);

  if (!visible || !me) return null;

  const isHindi = me.language === 'hi';
  const current = TOUR_STEPS[step]!;
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-5" onClick={dismiss}>
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm animate-fadeIn" />
      <div
        className="relative w-full max-w-[360px] rounded-2xl border border-ember-500/30 bg-paper-50 dark:bg-paper-900 p-6 shadow-2xl animate-slideUp"
        onClick={e => e.stopPropagation()}
      >
        {/* Skip button */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-xs text-muted-400 hover:text-ink-700 transition-colors"
        >
          {isHindi ? 'छोड़ें' : 'Skip'}
        </button>

        {/* Emoji */}
        <div className="text-center">
          <span className="text-5xl">{current.emoji}</span>
        </div>

        {/* Content */}
        <h3 className="mt-4 font-serif text-xl font-bold text-ink-900 dark:text-ink-100 text-center">
          {isHindi ? current.titleHi : current.titleEn}
        </h3>
        <p className="mt-2 text-sm text-muted-600 dark:text-muted-400 text-center leading-relaxed">
          {isHindi ? current.descHi : current.descEn}
        </p>

        {/* Progress dots */}
        <div className="mt-5 flex justify-center gap-1.5">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-ember-500' : 'w-1.5 bg-muted-300'
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="mt-5 flex items-center gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex-1 rounded-xl border border-line bg-paper-100 dark:bg-paper-800 px-4 py-2.5 text-sm font-medium text-ink-700 dark:text-ink-300 hover:bg-paper-200 transition-colors"
            >
              ← {isHindi ? 'पीछे' : 'Back'}
            </button>
          )}
          <button
            onClick={next}
            className="flex-1 rounded-xl bg-ember-500 px-4 py-2.5 text-sm font-bold text-paper-50 hover:bg-ember-600 transition-colors"
          >
            {isLast
              ? (isHindi ? 'शुरू करें!' : 'Get Started!')
              : (isHindi ? 'आगे →' : 'Next →')}
          </button>
        </div>
      </div>
    </div>
  );
}
