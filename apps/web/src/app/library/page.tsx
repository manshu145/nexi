'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { MobileNav } from '~/components/MobileNav';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { t, getLanguage } from '~/lib/i18n';

/**
 * /library — AI generates chapters on-demand at student's level.
 * No pre-created content needed. Type a topic → get a full chapter.
 */
export default function LibraryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const lang = getLanguage();
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [chapter, setChapter] = useState<{
    title: string;
    sections: { heading: string; content: string }[];
    summary: string;
    keyPoints: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading || !user) {
    return <main className="flex min-h-screen items-center justify-center"><span className="spinner" /></main>;
  }

  async function onGenerate() {
    if (!topic.trim()) return;
    setGenerating(true);
    setError(null);
    setChapter(null);
    try {
      const res = await api.ai.generateChapter(topic.trim());
      setChapter(res.chapter);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pt-6 pb-24 sm:px-6">
        <header className="flex items-center justify-between">
          <Logo />
          <button type="button" onClick={() => router.push('/dashboard')} className="btn-ghost-sm">
            {t('common.back', 'Back')}
          </button>
        </header>

        <section className="mt-6">
          <h1 className="font-serif text-2xl font-semibold text-ink-900">
            {lang === 'hi' ? 'AI लाइब्रेरी' : 'AI Library'}
          </h1>
          <p className="mt-1 text-sm text-muted-500">
            {lang === 'hi' ? 'कोई भी टॉपिक लिखें — AI आपके स्तर का अध्याय बनाएगा' : 'Type any topic — AI generates a chapter at YOUR level'}
          </p>
        </section>

        {/* Input */}
        <div className="mt-5 flex gap-2">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onGenerate()}
            placeholder={lang === 'hi' ? 'टॉपिक लिखें (जैसे: प्रकाश संश्लेषण)' : 'Enter topic (e.g., Photosynthesis, Newton\'s Laws)'}
            className="flex-1 rounded-lg border border-line bg-paper-50 px-4 py-2.5 text-sm text-ink-900 placeholder:text-muted-400 focus:outline-none focus:ring-2 focus:ring-ember-600"
          />
          <button type="button" onClick={onGenerate} disabled={generating || !topic.trim()} className="btn-primary whitespace-nowrap">
            {generating ? <span className="spinner" /> : (lang === 'hi' ? 'बनाएं' : 'Generate')}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-ember-600">{error}</p>}

        {/* Generating state */}
        {generating && (
          <div className="mt-8 text-center">
            <span className="spinner" />
            <p className="mt-3 text-sm text-muted-500">
              {lang === 'hi' ? 'AI आपके लिए अध्याय लिख रहा है...' : 'AI is writing a chapter personalized for you...'}
            </p>
          </div>
        )}

        {/* Generated chapter — Kindle-style */}
        {chapter && (
          <article className="mt-6 rounded-lg border-l-4 border-l-ember-600 bg-gradient-to-br from-[#FFFDF5] to-[#F8F1DD] p-5 shadow-lg sm:p-8" style={{ fontFamily: 'var(--font-serif)' }}>
            <h2 className="text-xl font-bold text-ink-900 sm:text-2xl">{chapter.title}</h2>
            <p className="mt-3 text-sm italic text-muted-500 leading-relaxed">{chapter.summary}</p>

            {chapter.sections.map((section, i) => (
              <div key={i} className="mt-6">
                <h3 className="text-base font-semibold text-ink-900">{section.heading}</h3>
                <p className="mt-2 text-sm leading-[1.8] text-ink-800 whitespace-pre-wrap">{section.content}</p>
              </div>
            ))}

            {chapter.keyPoints.length > 0 && (
              <div className="mt-6 border-t border-line pt-4">
                <h3 className="text-sm font-semibold text-ember-600">
                  {lang === 'hi' ? '📌 मुख्य बिंदु' : '📌 Key Points'}
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-ink-800">
                  {chapter.keyPoints.map((kp, i) => (
                    <li key={i} className="flex gap-2"><span className="text-ember-600">•</span> {kp}</li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        )}

        {/* Suggested topics */}
        {!chapter && !generating && (
          <section className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">
              {lang === 'hi' ? 'सुझाव' : 'Suggestions'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Photosynthesis', 'Newton\'s Laws', 'Indian Constitution', 'Periodic Table', 'Human Heart', 'French Revolution', 'Trigonometry', 'Solar System'].map((t) => (
                <button key={t} type="button" onClick={() => setTopic(t)} className="pill hover:bg-paper-300 cursor-pointer transition">
                  {t}
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
      <MobileNav />
    </>
  );
}
