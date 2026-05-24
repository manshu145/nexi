'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type ReferralMeResponse } from '~/lib/api';

/**
 * /refer -- Phase 16
 *
 * Student referral hub.
 *
 *   - Shows the user's stable referral code + share URL
 *   - WhatsApp / SMS / email / copy buttons that all point at the same
 *     /signin?ref=CODE deep link
 *   - Stats: total referred, rewarded, retained, credits earned
 *
 * The code is server-generated and stable per user, so we don't need to
 * persist it client-side -- a fresh fetch on mount is fine.
 */
export default function ReferralHubPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<ReferralMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.referrals.me();
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load referral hub');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Pre-built share message; reused across WhatsApp / SMS / email so the
  // onboarding referrer credits stay clean across channels.
  const shareMessage = useMemo(() => {
    if (!data) return '';
    return [
      'Trying out Nexigrate -- a calm, AI-verified study app for Indian exams.',
      'Sign up with my code and we both get bonus credits.',
      `Code: ${data.code}`,
      `Link: ${data.shareUrl}`,
    ].join('\n');
  }, [data]);

  async function copyCode() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked -- show fallback */
    }
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading...
        </span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pt-6 pb-24 sm:px-6 sm:pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <Link href="/dashboard" className="btn-ghost-sm">
          Dashboard
        </Link>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Refer & earn</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Bring a friend, both get credits.
        </h1>
        {data ? (
          <p className="mt-2 text-ink-800">
            Earn{' '}
            <span className="font-medium text-ink-900">
              {data.perReferralReward.signup} credits
            </span>{' '}
            when a friend signs up with your code, plus another{' '}
            <span className="font-medium text-ink-900">
              {data.perReferralReward.retained}
            </span>{' '}
            once they{'\u2019'}re still around 7 days later.
          </p>
        ) : null}
      </section>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {data ? (
        <>
          <section className="paper-card mt-6 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
              Your code
            </p>
            <p className="font-serif mt-2 text-4xl font-bold tracking-[0.2em] text-ink-900">
              {data.code}
            </p>
            <p className="mt-2 text-sm text-muted-500 break-all">{data.shareUrl}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyCode}
                className="btn-primary"
                aria-live="polite"
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                WhatsApp
              </a>
              <a
                href={`sms:?&body=${encodeURIComponent(shareMessage)}`}
                className="btn-ghost"
              >
                SMS
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(
                  'Try Nexigrate with my code',
                )}&body=${encodeURIComponent(shareMessage)}`}
                className="btn-ghost"
              >
                Email
              </a>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            <Stat
              label="Friends referred"
              value={data.stats.totalReferred}
              hint="counts every signup with your code"
            />
            <Stat
              label="Stuck around"
              value={data.stats.retained}
              hint="active 7 days after signup"
            />
            <Stat
              label="Credits earned"
              value={data.stats.creditsEarned}
              hint="from referrals, all-time"
            />
          </section>

          <p className="mt-8 text-xs text-muted-500">
            Self-referrals don{'\u2019'}t count. We pay the signup bonus
            immediately and the retention bonus once your friend is still
            using the app a week later.
          </p>
        </>
      ) : !error ? (
        <p className="mt-8 text-sm text-muted-500">Loading your code...</p>
      ) : null}
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="paper-card p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
        {label}
      </p>
      <p className="font-serif mt-2 text-3xl font-semibold tabular-nums text-ink-900">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-500">{hint}</p> : null}
    </div>
  );
}
