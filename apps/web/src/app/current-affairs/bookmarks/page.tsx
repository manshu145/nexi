'use client';

/**
 * Saved News bookmarks page (PR-34c, audit #30).
 *
 * Backend has stored per-user bookmark IDs since the reels feature
 * shipped, but the web app had no surface to read them — students
 * could only bookmark, never review their saved list. This page fans
 * out the bookmark IDs into full article details (Promise.all) and
 * gracefully drops any 404s left behind by the 48-hour current-affairs
 * sweeper.
 *
 * Brand-tokens only. Auth gate via useUser() per PR-32.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api, type CurrentAffairsItem } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';
import { Logo } from '~/components/Logo';
import { CATEGORY_EMOJIS, CATEGORY_IMAGES } from '../_shared';

export default function SavedNewsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: me, loading: meLoading } = useUser();
  const [items, setItems] = useState<CurrentAffairsItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!authLoading && !user) router.replace('/signin'); }, [authLoading, user, router]);

  const load = useCallback(async () => {
    try {
      const lang = (typeof window !== 'undefined'
        ? (localStorage.getItem('nexigrate-language') as 'en' | 'hi' | null)
        : null) ?? 'en';
      const { bookmarks } = await api.getNewsBookmarks();
      if (bookmarks.length === 0) { setItems([]); return; }

      // Fan out in parallel. The 48-hour sweeper might have purged some
      // articles since the user bookmarked them; we silently drop those
      // (returning null from the per-fetch promise) rather than showing
      // a hard error for what is really an expected lifecycle event.
      const results = await Promise.all(
        bookmarks.map((id) =>
          api.getCurrentAffairsDetail(id, lang)
            .then((r) => r.item)
            .catch(() => null),
        ),
      );
      setItems(results.filter((x): x is CurrentAffairsItem => x !== null));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load bookmarks');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  const handleRemove = async (id: string) => {
    try {
      const res = await api.toggleNewsBookmark(id);
      if (!res.bookmarked) {
        // Optimistically drop from the list — server is source of truth
        // but we already know it's gone.
        setItems((prev) => prev?.filter((it) => it.id !== id) ?? prev);
        toast.success('Removed from saved');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove');
    }
  };

  if (authLoading || !user || meLoading || !me || loading) {
    return <main className="flex min-h-dvh items-center justify-center"><AILoader context="general" /></main>;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-6 pb-16">
      <header className="flex items-center justify-between">
        <button type="button" onClick={() => router.back()} className="btn-ghost-sm">← Back</button>
        <Logo height={36} />
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Saved News</h1>
        <p className="mt-1 text-sm text-muted-500">Articles you bookmarked from the daily reel.</p>
      </section>

      <section className="mt-6">
        {items && items.length === 0 ? (
          <div className="paper-card p-8 text-center">
            <p className="text-sm text-muted-500">You haven&apos;t saved any news yet.</p>
            <Link
              href="/current-affairs"
              className="mt-3 inline-block text-sm font-medium text-ember-600 hover:underline"
            >
              Browse today&apos;s reel →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {items?.map((item) => {
              const emoji = CATEGORY_EMOJIS[item.category] ?? '📰';
              const imageUrl = CATEGORY_IMAGES[item.category] ?? CATEGORY_IMAGES['national']!;
              const excerpt = (item.body || item.summary || '').replace(/\s+/g, ' ').trim().slice(0, 120);
              return (
                <article
                  key={item.id}
                  className="paper-card flex flex-col overflow-hidden p-0 transition-colors hover:border-ember-500/40 hover:bg-ember-500/5"
                >
                  <div className="relative h-32 w-full overflow-hidden bg-paper-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt={item.category}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); void handleRemove(item.id); }}
                      aria-label="Remove bookmark"
                      className="absolute right-2 top-2 rounded-full bg-paper-50/90 p-1.5 text-base shadow-sm backdrop-blur-sm transition-colors hover:bg-paper-50"
                      title="Remove bookmark"
                    >
                      🔖
                    </button>
                    <span className="absolute left-2 top-2 rounded-full bg-paper-50/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-900 backdrop-blur-sm">
                      {emoji} {item.category}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <h2 className="font-serif line-clamp-2 text-sm font-semibold text-ink-900">
                      {item.headline}
                    </h2>
                    {excerpt && (
                      <p className="mt-2 line-clamp-3 text-xs text-muted-500">
                        {excerpt}
                        {(item.body || item.summary || '').length > 120 ? '…' : ''}
                      </p>
                    )}
                    <Link
                      href={`/current-affairs/${item.id}`}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ember-600 hover:underline"
                    >
                      Read more →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
