'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { MobileNav } from '~/components/MobileNav';
import { api, type NexipediaArticle } from '~/lib/api';
import { getLang, t } from '~/lib/i18n';

export default function NexipediaPage() {
  const router = useRouter();
  const lang = getLang();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState<NexipediaArticle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  async function onSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setArticle(null);
    try {
      const res = await api.searchNexipedia(query.trim());
      setArticle(res.article);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }

  function speak(text: string) {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 pt-6 pb-24 sm:max-w-3xl sm:px-6">
        <header className="flex items-center justify-between">
          <Logo />
          <button type="button" onClick={() => router.push('/dashboard')} className="btn-ghost-sm">
            {t('common.back', lang)}
          </button>
        </header>

        <section className="mt-6">
          <h1 className="font-serif text-2xl font-semibold text-ink-900">{t('nex.title', lang)}</h1>
          <p className="mt-1 text-sm text-muted-500">
            {lang === 'hi' ? 'किसी भी विषय पर AI से जानकारी पाएं' : 'AI-powered encyclopedia — search anything'}
          </p>
        </section>

        {/* Search */}
        <div className="mt-5 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            placeholder={t('nex.search', lang)}
            className="flex-1 rounded-lg border border-line bg-paper-50 px-4 py-2.5 text-sm text-ink-900 placeholder:text-muted-400 focus:outline-none focus:ring-2 focus:ring-ember-600"
          />
          <button type="button" onClick={onSearch} disabled={loading || !query.trim()} className="btn-primary">
            {loading ? <span className="spinner" /> : t('nex.explore', lang)}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-ember-600">{error}</p>}

        {/* Article */}
        {article && (
          <article className="mt-6 space-y-6">
            {/* Title + Summary */}
            <div className="paper-card p-5">
              <h2 className="font-serif text-xl font-bold text-ink-900 sm:text-2xl">{article.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-800">{article.summary}</p>
              <button
                type="button"
                onClick={() => speak(article.summary)}
                className="mt-3 pill hover:bg-paper-300 transition"
              >
                {speaking ? '⏸ Stop' : `🔊 ${t('kindle.listen', lang)}`}
              </button>
            </div>

            {/* Sections with images */}
            {article.sections.map((section, i) => (
              <div key={i} className="paper-card p-5">
                <h3 className="font-serif text-base font-semibold text-ink-900">{section.heading}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-800 whitespace-pre-wrap">{section.content}</p>
                {section.imageQuery && (
                  <div className="mt-3 rounded-lg overflow-hidden bg-paper-200 p-2">
                    <img
                      src={`https://source.unsplash.com/600x300/?${encodeURIComponent(section.imageQuery)}`}
                      alt={section.imageQuery}
                      className="w-full rounded-md object-cover h-40 sm:h-48"
                      loading="lazy"
                    />
                    <p className="mt-1 text-[10px] text-muted-500 text-center">
                      {lang === 'hi' ? 'संबंधित चित्र' : 'Related image'}: {section.imageQuery}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => speak(section.content)}
                  className="mt-3 pill hover:bg-paper-300 transition text-xs"
                >
                  🔊 {t('kindle.listen', lang)}
                </button>
              </div>
            ))}

            {/* YouTube */}
            {article.youtubeQuery && (
              <div className="paper-card p-5">
                <h3 className="font-serif text-base font-semibold text-ink-900">🎬 {t('nex.video', lang)}</h3>
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(article.youtubeQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-2 text-sm text-ember-600 underline hover:text-ember-700"
                >
                  {lang === 'hi' ? 'YouTube पर खोजें' : 'Search on YouTube'} →
                </a>
              </div>
            )}

            {/* Related topics */}
            {article.relatedTopics.length > 0 && (
              <div className="paper-card p-5">
                <h3 className="font-serif text-sm font-semibold text-muted-500 uppercase tracking-wider">
                  {t('nex.related', lang)}
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {article.relatedTopics.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => { setQuery(topic); onSearch(); }}
                      className="pill hover:bg-paper-300 transition cursor-pointer"
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </article>
        )}

        {/* Suggested topics when empty */}
        {!article && !loading && (
          <section className="mt-8">
            <p className="text-xs font-semibold uppercase text-muted-500 tracking-wider">
              {lang === 'hi' ? 'लोकप्रिय विषय' : 'Popular Topics'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Photosynthesis', 'Indian Constitution', 'Newton\'s Laws', 'World War II', 'Solar System', 'Human Heart', 'Periodic Table', 'French Revolution'].map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => { setQuery(topic); }}
                  className="pill hover:bg-paper-300 transition cursor-pointer"
                >
                  {topic}
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
