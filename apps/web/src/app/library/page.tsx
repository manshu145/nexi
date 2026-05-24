'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { MobileNav } from '~/components/MobileNav';
import { api, type GeneratedChapter } from '~/lib/api';
import { getLang, t } from '~/lib/i18n';

export default function LibraryPage() {
  const router = useRouter();
  const lang = getLang();
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [chapter, setChapter] = useState<GeneratedChapter | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.generateChapter(topic.trim());
      setChapter(res.chapter);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 pt-6 pb-24 sm:max-w-2xl sm:px-6">
        <header className="flex items-center justify-between">
          <Logo />
          <button type="button" onClick={() => router.push('/dashboard')} className="btn-ghost-sm">
            {t('common.back', lang)}
          </button>
        </header>

        <section className="mt-6">
          <h1 className="font-serif text-2xl font-semibold text-ink-900">{t('lib.title', lang)}</h1>
          <p className="mt-1 text-sm text-muted-500">
            {lang === 'hi' ? 'AI आपके स्तर के अनुसार अध्याय बनाएगा' : 'AI generates chapters personalized to your level'}
          </p>
        </section>

        {/* Generate chapter input */}
        <div className="mt-5 flex gap-2">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onGenerate()}
            placeholder={lang === 'hi' ? 'विषय दर्ज करें (जैसे: गुरुत्वाकर्षण)' : 'Enter topic (e.g., Gravity, Photosynthesis)'}
            className="flex-1 rounded-lg border border-line bg-paper-50 px-4 py-2.5 text-sm text-ink-900 placeholder:text-muted-400 focus:outline-none focus:ring-2 focus:ring-ember-600"
          />
          <button type="button" onClick={onGenerate} disabled={loading || !topic.trim()} className="btn-primary">
            {loading ? <span className="spinner" /> : t('lib.generate', lang)}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-ember-600">{error}</p>}

        {/* Generated chapter in Kindle view */}
        {chapter && (
          <article className="mt-6 kindle-book">
            <div className="kindle-page">
              <h2 className="font-serif text-xl font-bold text-ink-900">{chapter.title}</h2>
              <p className="mt-3 text-sm italic text-muted-500">{chapter.summary}</p>

              {chapter.sections.map((section, i) => (
                <div key={i} className="mt-6">
                  <h3 className="font-serif text-base font-semibold text-ink-900">{section.heading}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-800 whitespace-pre-wrap">{section.content}</p>
                </div>
              ))}

              {chapter.keyPoints.length > 0 && (
                <div className="mt-6 border-t border-line pt-4">
                  <h3 className="font-serif text-sm font-semibold text-ember-600">
                    {lang === 'hi' ? 'मुख्य बिंदु' : 'Key Points'}
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm text-ink-800">
                    {chapter.keyPoints.map((kp, i) => (
                      <li key={i} className="flex gap-2"><span className="text-ember-600">•</span> {kp}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </article>
        )}
      </main>
      <MobileNav />
    </>
  );
}
