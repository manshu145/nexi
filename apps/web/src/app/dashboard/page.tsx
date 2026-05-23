'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXAM_BY_SLUG, type CreditBalance } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse } from '~/lib/api';

/**
 * Student dashboard.
 *
 * Three things on screen, always:
 *   1. Today's MCQ card -- one tap to start
 *   2. Credits balance, plus an "expiring soon" hint when relevant
 *   3. Sign out (small, in the top-right)
 *
 * No nav, no notifications, no algorithmic feed. The whole product
 * principle is to keep this page calm.
 */
export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [meRes, balRes] = await Promise.all([api.me(), api.getBalance()]);
        if (cancelled) return;
        setMe(meRes.user);
        setBalance(balRes);
        if (!meRes.user.targetExam) {
          router.replace('/onboarding');
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading…
        </span>
      </main>
    );
  }

  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/upgrade')}
            className="btn-ghost-sm"
          >
            Upgrade
          </button>
          <button
            type="button"
            onClick={() => signOut().then(() => router.replace('/signin'))}
            className="btn-ghost-sm"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="mt-10">
        <p className="text-sm text-muted-500">
          {greeting()}, {firstName(me?.name ?? user.displayName ?? 'student')}
        </p>
        <h1 className="font-serif mt-1 text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Today’s study slate
        </h1>
        {examName ? (
          <p className="mt-2 text-sm text-muted-500">
            Tracking <span className="font-medium text-ink-800">{examName}</span>
          </p>
        ) : null}
      </section>

      <section className="paper-card mt-8 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          Daily MCQ · 10 questions
        </p>
        <h2 className="font-serif mt-3 text-2xl font-semibold leading-snug text-ink-900">
          Take today’s questions, earn credits.
        </h2>
        <p className="mt-3 text-ink-800">
          Pass with 7/10 or more to earn <span className="font-medium">+50 credits</span>.
          Even a failed attempt earns +5 — nobody gets locked out.
        </p>
        <button
          type="button"
          onClick={() => router.push('/mcq')}
          className="btn-primary mt-6"
        >
          Start daily MCQ
        </button>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Credits balance
          </p>
          <p className="font-serif mt-2 text-3xl font-semibold tabular-nums text-ink-900">
            {balance ? balance.total : '\u2014'}
          </p>
          {balance && balance.expiringSoon > 0 ? (
            <p className="mt-1 text-xs text-ember-600">
              {balance.expiringSoon} expiring within 7 days
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-500">Earn more by taking the daily MCQ</p>
          )}
        </div>
        <div className="paper-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
            Verification
          </p>
          <p className="mt-2 text-ink-800">
            {me?.isVerified
              ? 'You\u2019re verified.'
              : 'You\u2019re in our private beta. Identity verification arrives by end of June.'}
          </p>
        </div>
      </section>

      {error ? (
        <p className="mt-8 text-sm text-ember-600" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}

function firstName(full: string): string {
  const trimmed = full.trim();
  const space = trimmed.indexOf(' ');
  return space < 0 ? trimmed : trimmed.slice(0, space);
}

function greeting(): string {
  // IST hour (rough)
  const istHour = (new Date().getUTCHours() + 5.5) % 24;
  if (istHour < 12) return 'Good morning';
  if (istHour < 17) return 'Good afternoon';
  return 'Good evening';
}
