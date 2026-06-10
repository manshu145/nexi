'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useAuth } from '~/lib/auth-context';
import { api, type ReviewItem } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';

function prettify(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function RevisePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('revise');
  const tc = useTranslations('common');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(true);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getReviewDue(30);
        if (!cancelled) setItems(res.items);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoadingItems(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const grade = async (item: ReviewItem, quality: number) => {
    setBusy(item.id);
    try {
      await api.gradeReview(item.id, quality);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      // Previously failures were swallowed silently — the card just stayed
      // put with no explanation. Tell the user so they can retry.
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    }
    finally { setBusy(null); }
  };

  if (loading || loadingItems) {
    return <main className="min-h-dvh bg-paper-100"><AILoader context="chat" /></main>;
  }

  return (
    <main className="min-h-dvh bg-paper-100 px-4 pt-6 pb-24">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between gap-3">
          <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm" aria-label="Back to dashboard">← {tc('back')}</button>
          <Logo height={28} />
        </header>

        <div className="mt-6">
          <h1 className="font-serif text-2xl font-bold text-ink-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-500">
            {t('subtitle')}
          </p>
        </div>

        {items.length === 0 ? (
          <div className="paper-card mt-8 p-8 text-center">
            <span aria-hidden className="text-4xl">✅</span>
            <h2 className="mt-3 font-serif text-lg font-semibold text-ink-900">{t('allCaughtUp')}</h2>
            <p className="mt-2 text-sm text-muted-500">{t('allCaughtUpDesc')}</p>
            <button onClick={() => router.push('/study')} className="btn-primary mt-5">{t('goToStudy')}</button>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {items.map((item) => (
              <li key={item.id} className="paper-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-900">{prettify(item.chapter)}</p>
                    <p className="mt-0.5 text-xs text-muted-500">{prettify(item.subject)} · {t('lastScore')} {item.lastScore}%</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-ember-500/10 px-2 py-0.5 text-[11px] font-semibold text-ember-600">{t('due')}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => router.push(`/study/${item.subject}/${item.chapter}/flashcards`)}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >🃏 {t('flashcards')}</button>
                  <button
                    onClick={() => router.push(`/study/${item.subject}/${item.chapter}`)}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >📖 {t('reRead')}</button>
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  <span className="text-[11px] text-muted-500">{t('markIt')}</span>
                  <button
                    onClick={() => grade(item, 2)}
                    disabled={busy === item.id}
                    className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-paper-100 disabled:opacity-50"
                  >↺ {t('forgot')}</button>
                  <button
                    onClick={() => grade(item, 4)}
                    disabled={busy === item.id}
                    className="flex-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-paper-100 disabled:opacity-50"
                  >🙂 {t('good')}</button>
                  <button
                    onClick={() => grade(item, 5)}
                    disabled={busy === item.id}
                    className="flex-1 rounded-lg bg-ember-500 px-3 py-1.5 text-xs font-semibold text-paper-50 hover:bg-ember-600 disabled:opacity-50"
                  >✓ {t('easy')}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
