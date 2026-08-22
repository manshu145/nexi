'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '~/lib/auth-context';
import { api, type CreditEvent } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

type FilterKind = 'all' | 'earned' | 'spent';

/**
 * Icons for every credit-economy source/reason. The keys here mirror the
 * backend enums in `apps/api/src/lib/creditLedger.ts`. Human-readable labels
 * live in the i18n catalog (credits.earnLabels / credits.spendLabels) so they
 * localize; the icon stays here since it's language-agnostic.
 */
const EARN_ICONS: Record<string, string> = {
  signup_verified: '🎉',
  daily_login: '📅',
  chapter_complete: '📖',
  mcq_pass: '✅',
  mcq_fail_attempted: '📝',
  streak_7d: '🔥',
  streak_30d: '🏆',
  referral_signup: '🎁',
  referral_retained_7d: '🌟',
  referral_bonus: '🎊',
  admin_grant: '⚙️',
  subscription_grant: '⭐',
};

const SPEND_ICONS: Record<string, string> = {
  read_chapter: '📚',
  focus_session_1h: '⏳',
  mock_test: '🧪',
  ai_tutor_question: '🤖',
  concept_video: '🎬',
  long_answer_grading: '✍️',
  admin_revoke: '⚙️',
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString() === d.toDateString();
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    if (sameDay) return `Today, ${time}`;
    if (yesterday) return `Yesterday, ${time}`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function CreditsPage() {
  const t = useTranslations('credits');
  const locale = useLocale();
  const dateLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';
  const { user, loading } = useAuth();
  const router = useRouter();

  // Resolve a credit event into a localized label + its language-agnostic icon.
  const describe = (event: CreditEvent): { label: string; icon: string } => {
    if (event.event.kind === 'earn') {
      const src = event.event.source;
      return {
        label: EARN_ICONS[src] ? t(`earnLabels.${src}` as never) : src,
        icon: EARN_ICONS[src] ?? '💎',
      };
    }
    if (event.event.kind === 'spend') {
      const reason = event.event.reason;
      return {
        label: SPEND_ICONS[reason] ? t(`spendLabels.${reason}` as never) : reason,
        icon: SPEND_ICONS[reason] ?? '💎',
      };
    }
    return { label: t('bucketExpired'), icon: '⌛' };
  };
  const [pageLoading, setPageLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [earnRates, setEarnRates] = useState<Record<string, number>>({});
  const [events, setEvents] = useState<CreditEvent[]>([]);
  const [filter, setFilter] = useState<FilterKind>('all');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  // Initial fetch: balance + first page of history. Both run in parallel for
  // a snappier first paint -- balance is the hero number, events fill below.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [bal, hist] = await Promise.all([
          api.getCreditsBalance(),
          api.getCreditEvents({ limit: 50 }),
        ]);
        if (cancelled) return;
        setBalance(bal.credits);
        setEarnRates(bal.earnRates ?? {});
        setEvents(hist.events);
        setHasMore(hist.events.length === 50);
      } catch { /* surface is best-effort; balance card stays at 0 */ }
      finally { if (!cancelled) setPageLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const filtered = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'earned') return events.filter((e) => e.amount > 0);
    return events.filter((e) => e.amount < 0);
  }, [events, filter]);

  const grouped = useMemo(
    () => groupByDay(filtered, { today: t('today'), yesterday: t('yesterday'), dateLocale }),
    [filtered, t, dateLocale],
  );

  // Earn options shown in the "Earn more" card. Read directly from the rate
  // table the server returned, so the number a user sees is the number the
  // server will award. No more drift between UI copy and backend logic.
  const earnOptions = useMemo(() => {
    const order: Array<{ key: string; label: string; icon: string }> = [
      { key: 'daily_login', label: t('earn.daily_login'), icon: '📅' },
      { key: 'chapter_complete', label: t('earn.chapter_complete'), icon: '📖' },
      { key: 'mcq_pass', label: t('earn.mcq_pass'), icon: '✅' },
      { key: 'streak_7d', label: t('earn.streak_7d'), icon: '🔥' },
      { key: 'streak_30d', label: t('earn.streak_30d'), icon: '🏆' },
      { key: 'referral_signup', label: t('earn.referral_signup'), icon: '🎁' },
    ];
    return order
      .map((o) => ({ ...o, amount: earnRates[o.key] ?? null }))
      .filter((o) => o.amount && o.amount > 0);
  }, [earnRates, t]);

  async function handleLoadMore() {
    if (loadingMore || !hasMore || events.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = events[events.length - 1]!;
      const next = await api.getCreditEvents({ limit: 50, before: oldest.occurredAt });
      setEvents((prev) => [...prev, ...next.events]);
      setHasMore(next.events.length === 50);
    } catch { /* swallow; user can retry by tapping again */ }
    finally { setLoadingMore(false); }
  }

  if (loading || !user || pageLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <AILoader context="general" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-16">
      <button onClick={() => router.back()} className="btn-ghost-sm self-start">{t('back')}</button>

      <h1 className="font-serif mt-4 text-2xl font-bold text-ink-900">{t('title')}</h1>

      {/* Hero balance card */}
      <section className="mt-6 paper-card flex flex-col items-center p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('availableBalance')}</p>
        <p className="mt-2 font-serif text-5xl font-bold text-ember-500">{balance.toLocaleString('en-IN')}</p>
        <p className="mt-1 text-sm text-muted-500">{t('credits')}</p>
      </section>

      {/* Earn more — read straight from the server's rate table */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('howToEarn')}</h2>
        <ul className="mt-3 paper-card divide-y divide-line p-0">
          {earnOptions.map((opt) => (
            <li key={opt.key} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="text-xl">{opt.icon}</span>
                <span className="text-sm font-medium text-ink-900">{opt.label}</span>
              </div>
              <span className="text-sm font-bold text-ember-500">+{opt.amount}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Get more credits CTAs */}
      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('getMore')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button onClick={() => router.push('/refer')} className="paper-card flex flex-col items-start p-4 text-left transition-shadow hover:shadow-md">
            <span className="text-xl">🎁</span>
            <p className="mt-2 text-sm font-semibold text-ink-900">{t('referEarn')}</p>
            <p className="mt-0.5 text-xs font-medium text-ember-500">{t('perReferral', { amount: earnRates.referral_signup ?? 50 })}</p>
          </button>
          <button onClick={() => router.push('/upgrade')} className="paper-card flex flex-col items-start p-4 text-left transition-shadow hover:shadow-md">
            <span className="text-xl">⭐</span>
            <p className="mt-2 text-sm font-semibold text-ink-900">{t('upgradePlan')}</p>
            <p className="mt-0.5 text-xs font-medium text-ember-500">{t('noDeduction')}</p>
          </button>
        </div>
      </section>

      {/* History timeline with filters */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('history')}</h2>
          <div className="inline-flex rounded-full border border-line bg-paper-50 p-0.5 text-xs">
            {(['all', 'earned', 'spent'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full px-3 py-1 transition-colors ${filter === k ? 'bg-ember-500 text-white' : 'text-muted-600 hover:text-ink-900'}`}
              >
                {t(k)}
              </button>
            ))}
          </div>
        </div>

        {grouped.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted-500">
            {filter === 'all' ? t('emptyActivity') : t('emptyFiltered', { filter: t(filter) })}
          </p>
        ) : (
          <div className="mt-3 space-y-5">
            {grouped.map((group) => (
              <div key={group.dayKey}>
                <p className="mb-2 text-xs font-medium text-muted-500">{group.label}</p>
                <ul className="paper-card divide-y divide-line p-0">
                  {group.items.map((event) => {
                    const meta = describe(event);
                    const positive = event.amount > 0;
                    return (
                      <li key={event.id} className="flex items-start justify-between gap-3 p-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 text-lg leading-none">{meta.icon}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink-900 truncate">{meta.label}</p>
                            {event.sourceRef && (
                              <p className="text-xs text-muted-500 truncate">{event.sourceRef}</p>
                            )}
                            <p className="text-xs text-muted-400">
                              {new Date(event.occurredAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <span className={`shrink-0 text-sm font-bold ${positive ? 'text-ember-500' : 'text-muted-500'}`}>
                          {positive ? '+' : ''}{event.amount}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="btn-ghost mx-auto block text-sm"
              >
                {loadingMore ? t('loading') : t('loadMore')}
              </button>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] leading-relaxed text-muted-400">
          {t('historyNote')}
        </p>
      </section>
    </main>
  );
}

interface DayGroup {
  dayKey: string;
  label: string;
  items: CreditEvent[];
}

/**
 * Group events into "Today / Yesterday / DD MMM" buckets. Events arrive
 * already sorted desc by occurredAt; we preserve that order within groups.
 */
function groupByDay(
  events: CreditEvent[],
  labels: { today: string; yesterday: string; dateLocale: string },
): DayGroup[] {
  const out: DayGroup[] = [];
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const todayKey = today.toDateString();
  const yKey = yesterday.toDateString();

  for (const e of events) {
    const d = new Date(e.occurredAt);
    const k = d.toDateString();
    let label: string;
    if (k === todayKey) label = labels.today;
    else if (k === yKey) label = labels.yesterday;
    else label = d.toLocaleDateString(labels.dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
    const last = out[out.length - 1];
    if (last && last.dayKey === k) {
      last.items.push(e);
    } else {
      out.push({ dayKey: k, label, items: [e] });
    }
  }
  return out;
}

// Suppress unused-import warning for formatTimestamp -- exported intentionally
// for future use by an event-detail modal.
void formatTimestamp;
