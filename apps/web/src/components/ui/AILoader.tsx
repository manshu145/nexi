'use client';
import { useEffect, useState, useRef } from 'react';

type LoaderContext = 'chapter' | 'quiz' | 'assessment' | 'chat' | 'currentAffairs' | 'dashboard' | 'general';

const MESSAGE_POOLS: Record<LoaderContext, string[]> = {
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
};

interface AILoaderProps {
  context?: LoaderContext;
  className?: string;
}

export function AILoader({ context = 'general', className = '' }: AILoaderProps) {
  const pool = MESSAGE_POOLS[context];
  const [messageIndex, setMessageIndex] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [phase, setPhase] = useState<'typing' | 'waiting' | 'clearing'>('typing');
  const charIndex = useRef(0);

  const currentMessage = pool[messageIndex % pool.length]!;

  useEffect(() => {
    charIndex.current = 0;
    setDisplayed('');
    setPhase('typing');
  }, [messageIndex]);

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
      <p className={`text-base text-center text-muted-500 transition-opacity duration-300 ${phase === 'clearing' ? 'opacity-0' : 'opacity-100'}`}>
        {displayed}<span className="animate-pulse">|</span>
      </p>
      {/* Indeterminate progress bar */}
      <div className="mt-4 w-48 h-1 rounded-full bg-paper-300 overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-gold-500 animate-[slideBar_1.5s_ease-in-out_infinite]" />
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
