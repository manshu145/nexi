'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type ReferralStats } from '~/lib/api';
import { toast } from 'sonner';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';

export default function ReferPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getReferralStats();
        if (!cancelled) setStats(res);
      } catch {
        // Fallback: generate a code from user uid
        if (!cancelled) {
          setStats({
            code: user.uid.slice(0, 8).toUpperCase(),
            referralUrl: `https://nexigrate.com?ref=${user.uid.slice(0, 8).toUpperCase()}`,
            totalReferrals: 0,
            pendingReferrals: 0,
            completedReferrals: 0,
            totalEarned: 0,
          });
        }
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleCopy = async () => {
    if (!stats) return;
    try {
      await navigator.clipboard.writeText(stats.code);
      toast.success('Referral code copied!');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const shareMessage = stats
    ? `Join Nexigrate - India's smartest exam prep app! Use my referral code: ${stats.code} and get 50 bonus credits. Download now: ${stats.referralUrl}`
    : '';

  const handleShare = async () => {
    if (!stats) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join Nexigrate', text: shareMessage });
      } catch { /* user cancelled */ }
    } else {
      handleCopy();
    }
  };

  const handleWhatsApp = () => {
    if (!stats) return;
    const encoded = encodeURIComponent(shareMessage);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  if (loading || !user || pageLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <AILoader context="general" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">← Back</button>
        <Logo height={36} />
      </header>

      {/* Title */}
      <section className="mt-8 text-center">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Refer & Earn 🎁</h1>
        <p className="mt-2 text-sm text-muted-500">Invite friends, earn 50 credits each</p>
      </section>

      {/* Referral Code Box */}
      {stats && (
        <section className="mt-8">
          <div className="rounded-2xl border-2 border-amber-500 bg-stone-900 p-6 text-center">
            <p className="text-xs font-medium text-stone-200 uppercase tracking-wider mb-2">Your Referral Code</p>
            <p className="font-mono text-3xl font-bold text-amber-500 tracking-widest">{stats.code}</p>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleCopy}
              className="flex-1 rounded-xl bg-stone-800 py-3 text-sm font-semibold text-stone-50 transition-colors hover:bg-stone-700"
            >
              📋 Copy Code
            </button>
            <button
              onClick={handleShare}
              className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-stone-900 transition-colors hover:bg-amber-600"
            >
              🔗 Share
            </button>
          </div>

          {/* WhatsApp Button */}
          <button
            onClick={handleWhatsApp}
            className="mt-3 w-full rounded-xl bg-stone-800 border border-stone-700 py-3 text-sm font-semibold text-stone-50 transition-colors hover:bg-stone-700 flex items-center justify-center gap-2"
          >
            <span className="text-lg">💬</span> Share on WhatsApp
          </button>
        </section>
      )}

      {/* Stats */}
      {stats && (
        <section className="mt-8">
          <div className="rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-500 mb-4">Your Referral Stats</h3>
            <div className="flex items-center justify-around">
              <div className="text-center">
                <p className="font-serif text-2xl font-bold text-ink-900">{stats.totalReferrals}</p>
                <p className="text-xs text-muted-500 mt-1">Friends Joined</p>
              </div>
              <div className="h-10 w-px bg-stone-200 dark:bg-stone-700" />
              <div className="text-center">
                <p className="font-serif text-2xl font-bold text-amber-500">{stats.totalEarned}</p>
                <p className="text-xs text-muted-500 mt-1">Credits Earned</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="mt-8">
        <h3 className="font-serif text-lg font-bold text-ink-900 mb-4">How it works</h3>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-stone-900">1</span>
            <div>
              <p className="text-sm font-semibold text-ink-900">Share your code</p>
              <p className="text-xs text-muted-500 mt-0.5">Send your unique referral code to friends via WhatsApp, SMS, or social media</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-stone-900">2</span>
            <div>
              <p className="text-sm font-semibold text-ink-900">Friend signs up</p>
              <p className="text-xs text-muted-500 mt-0.5">Your friend downloads Nexigrate and enters your code during sign-up</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-stone-900">3</span>
            <div>
              <p className="text-sm font-semibold text-ink-900">Both earn credits</p>
              <p className="text-xs text-muted-500 mt-0.5">You get 50 credits and your friend gets 50 bonus credits too!</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-stone-900">4</span>
            <div>
              <p className="text-sm font-semibold text-ink-900">No limits</p>
              <p className="text-xs text-muted-500 mt-0.5">Refer as many friends as you want — there&apos;s no cap on earning!</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
