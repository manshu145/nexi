'use client';
import { useEffect, useState, useRef } from 'react';
import { getClientLocale, type AppLocale } from '~/lib/locale';

type LoaderContext = 'chapter' | 'quiz' | 'assessment' | 'chat' | 'currentAffairs' | 'dashboard' | 'general';

/**
 * Bilingual loader message pools, one rotation per context.
 *
 * Hindi parity (lock §4.9): `पूरा का पूरा hindi me hi dikhna chahiye`.
 * The loader picks its language from `getClientLocale()` so the rotation
 * matches whatever language the rest of the app is speaking, including
 * inside error/not-found/offline boundaries where next-intl context may
 * not be reachable.
 *
 * Hindi messages were translated from the English originals and kept short
 * enough to fit a single line on a 360px-wide phone in 14px Inter Devanagari.
 */
const MESSAGE_POOLS: Record<AppLocale, Record<LoaderContext, string[]>> = {
  en: {
    chapter: [
      '📖 Preparing your chapter with AI...',
      '🧠 Structuring content from official syllabus...',
      '✨ Almost ready — this chapter is being crafted just for you...',
      '📚 Loading NCERT-grounded content...',
    ],
    quiz: [
      '🎯 Generating fresh questions just for you...',
      '🤖 Making sure you haven\'t seen these before...',
      '⚡ Picking your next challenge...',
      '🎲 Shuffling the question deck...',
    ],
    assessment: [
      '🔍 Analyzing your exam profile...',
      '🧩 Building your personalized question set...',
      '📊 Calibrating difficulty level...',
      '🎓 Preparing your assessment...',
    ],
    chat: [
      'Nexi is thinking...',
      'Searching through knowledge base...',
      'Crafting your answer...',
      'Processing your question...',
    ],
    currentAffairs: [
      '📰 Fetching latest verified news...',
      '✅ AI fact-checking in progress...',
      '🌐 Aggregating from official sources...',
    ],
    dashboard: [
      '👋 Loading your study dashboard...',
      '📈 Calculating your progress...',
    ],
    general: [
      '⚡ Loading...',
      '🚀 Almost there...',
      '✨ Preparing your content...',
    ],
  },
  hi: {
    chapter: [
      '📖 आपका अध्याय AI से तैयार हो रहा है...',
      '🧠 आधिकारिक पाठ्यक्रम से सामग्री संरचित की जा रही है...',
      '✨ लगभग तैयार — यह अध्याय खासकर आपके लिए तैयार किया जा रहा है...',
      '📚 NCERT-आधारित सामग्री लोड हो रही है...',
    ],
    quiz: [
      '🎯 आपके लिए नए प्रश्न बनाए जा रहे हैं...',
      '🤖 सुनिश्चित कर रहे हैं कि ये पहले नहीं देखे गए...',
      '⚡ आपकी अगली चुनौती चुनी जा रही है...',
      '🎲 प्रश्न-डेक मिलाई जा रही है...',
    ],
    assessment: [
      '🔍 आपकी परीक्षा प्रोफ़ाइल का विश्लेषण किया जा रहा है...',
      '🧩 आपका व्यक्तिगत प्रश्न-समूह बनाया जा रहा है...',
      '📊 कठिनाई स्तर अंशांकित हो रहा है...',
      '🎓 आपका मूल्यांकन तैयार हो रहा है...',
    ],
    chat: [
      'Nexi सोच रहा है...',
      'ज्ञान-आधार में खोज रहे हैं...',
      'आपका उत्तर तैयार किया जा रहा है...',
      'आपका प्रश्न संसाधित हो रहा है...',
    ],
    currentAffairs: [
      '📰 ताज़ा सत्यापित समाचार लाए जा रहे हैं...',
      '✅ AI तथ्य-जाँच जारी है...',
      '🌐 आधिकारिक स्रोतों से एकत्रित किया जा रहा है...',
    ],
    dashboard: [
      '👋 आपका अध्ययन डैशबोर्ड लोड हो रहा है...',
      '📈 आपकी प्रगति की गणना की जा रही है...',
    ],
    general: [
      '⚡ लोड हो रहा है...',
      '🚀 लगभग पहुँच गए...',
      '✨ आपकी सामग्री तैयार हो रही है...',
    ],
  },
};

interface AILoaderProps {
  context?: LoaderContext;
  className?: string;
  /** Force a locale; if omitted, the loader auto-detects via getClientLocale(). */
  locale?: AppLocale;
}

export function AILoader({ context = 'general', className = '', locale }: AILoaderProps) {
  // Detection happens in an effect so the first paint is stable across SSR/CSR
  // and a user toggling the language between renders gets the rotation in
  // their new language without a hard refresh.
  const [resolvedLocale, setResolvedLocale] = useState<AppLocale>(locale ?? 'en');
  useEffect(() => {
    if (!locale) setResolvedLocale(getClientLocale());
  }, [locale]);

  const pool = MESSAGE_POOLS[resolvedLocale][context];
  const [messageIndex, setMessageIndex] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [phase, setPhase] = useState<'typing' | 'waiting' | 'clearing'>('typing');
  const charIndex = useRef(0);

  const currentMessage = pool[messageIndex % pool.length]!;

  useEffect(() => {
    charIndex.current = 0;
    setDisplayed('');
    setPhase('typing');
  }, [messageIndex, resolvedLocale]);

  useEffect(() => {
    if (phase === 'typing') {
      if (charIndex.current >= currentMessage.length) {
        setPhase('waiting');
        return;
      }
      const timer = setTimeout(() => {
        charIndex.current++;
        setDisplayed(currentMessage.slice(0, charIndex.current));
      }, 40);
      return () => clearTimeout(timer);
    }

    if (phase === 'waiting') {
      const timer = setTimeout(() => setPhase('clearing'), 1500);
      return () => clearTimeout(timer);
    }

    if (phase === 'clearing') {
      const timer = setTimeout(() => {
        setMessageIndex(i => i + 1);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [phase, displayed, currentMessage]);

  return (
    <div className={`flex flex-col items-center justify-center min-h-[120px] ${className}`}>
      {/* Animated emoji */}
      <div className="text-3xl animate-bounce mb-3">
        {context === 'chapter' ? '📖' : context === 'quiz' ? '🎯' : context === 'assessment' ? '🎓' : context === 'chat' ? '🤖' : context === 'currentAffairs' ? '📰' : context === 'dashboard' ? '📈' : '✨'}
      </div>
      <p
        className={`text-sm font-medium text-center text-ink-800 dark:text-ink-200 transition-opacity duration-300 ${phase === 'clearing' ? 'opacity-0' : 'opacity-100'}`}
        // Hindi (Devanagari) needs `lang="hi"` so the browser picks the
        // correct font fallback chain; without this, some platforms render
        // matras with the wrong glyph spacing.
        lang={resolvedLocale}
      >
        {displayed}<span className="animate-pulse text-amber-500">|</span>
      </p>
      {/* Indeterminate progress bar */}
      <div className="mt-4 w-48 h-1.5 rounded-full bg-paper-300 dark:bg-paper-200 overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-amber-500 animate-[slideBar_1.5s_ease-in-out_infinite]" />
      </div>
      <style jsx>{`
        @keyframes slideBar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}
