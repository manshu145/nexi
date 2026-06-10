'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '~/lib/auth-context';
import { api, type ReferralStats } from '~/lib/api';
import { toast } from 'sonner';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';

/**
 * Refer & Earn page.
 *
 * Design system: brand tokens only (paper / ink / ember / gold / line /
 * muted) -- no `amber-*` or `stone-*` raw classes. Light + dark are
 * handled through the CSS-variable layer in globals.css, which means we
 * can drop the explicit `dark:` modifiers everywhere -- the variables
 * resolve to the right shade automatically.
 *
 * Credit copy is hardcoded to the locked PR-03 numbers (referrer +50,
 * invitee +100). The /credits page reads the live admin-configured
 * values; the marketing copy here is a frozen snapshot of the founder's
 * lock §2.2 commitment so the user always sees a single, predictable
 * promise even if an admin tunes the in-app rates.
 *
 * PR-34b (audit #44) addendum: the *share message* (which goes out via
 * navigator.share / WhatsApp deep links) DOES read the live signup-bonus
 * preview so the number a friend sees in the invite matches what they
 * actually receive. The on-page subtitle / steps stay frozen.
 */
export default function ReferPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('refer');
  const tc = useTranslations('common');
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  // PR-34b (audit #44): the share message used to hardcode "100 bonus
  // credits", which silently drifted whenever an admin retuned the
  // signup_verified earn rate via /admin/credit-rewards. We pull the
  // live amount from the public branding endpoint (cheap, unauthenticated,
  // already used by splash). Falls back to 100 if the call fails so the
  // share button never blocks on network.
  const [signupBonus, setSignupBonus] = useState<number>(100);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    let cancelled = false;
    api.getBranding()
      .then((b) => { if (!cancelled && Number.isFinite(b.signupBonusPreview) && b.signupBonusPreview > 0) setSignupBonus(b.signupBonusPreview); })
      .catch(() => { /* silently keep the 100-default */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getReferralStats();
        if (!cancelled) setStats(res);
      } catch {
        // Fallback: synthesise a code from the user's uid so the page
        // still renders something usable while the API is reachable but
        // returning errors. The first 8 chars of a Firebase uid are not a
        // valid referral code, so this fallback URL won't actually grant
        // credits to invitees -- it exists purely to avoid a blank screen.
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
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  const shareMessage = stats
    ? t('shareMessage', { code: stats.code, bonus: signupBonus, url: stats.referralUrl })
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
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-24">
      {/* Header */}
      <header className="flex items-center justify-between">
        <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">← {tc('back')}</button>
        <Logo height={36} />
      </header>

      {/* Title */}
      <section className="mt-8 text-center">
        <h1 className="font-serif text-2xl font-bold text-ink-900">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-500">{t('subtitle')}</p>
      </section>

      {/* Referral Code Box */}
      {stats && (
        <section className="mt-8">
          <div className="rounded-2xl border-2 border-ember-500 bg-ink-900 p-6 text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-paper-200 mb-2">{t('yourCode')}</p>
            <p className="font-mono text-3xl font-bold tracking-widest text-gold-500">{stats.code}</p>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleCopy}
              className="flex-1 rounded-xl bg-ink-800 py-3 text-sm font-semibold text-paper-50 transition-colors hover:bg-ink-700"
            >
              {t('copyCode')}
            </button>
            <button
              onClick={handleShare}
              className="flex-1 rounded-xl bg-ember-500 py-3 text-sm font-semibold text-paper-50 transition-colors hover:bg-ember-600"
            >
              {t('share')}
            </button>
          </div>

          {/* WhatsApp Button */}
          <button
            onClick={handleWhatsApp}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-ink-800 py-3 text-sm font-semibold text-paper-50 transition-colors hover:bg-ink-700"
          >
            <span className="text-lg">💬</span> {t('shareWhatsapp')}
          </button>
        </section>
      )}

      {/* Stats */}
      {stats && (
        <section className="mt-8">
          <div className="rounded-xl border border-line bg-paper-50 p-5">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-500">{t('statsHeading')}</h3>
            <div className="flex items-center justify-around">
              <div className="text-center">
                <p className="font-serif text-2xl font-bold text-ink-900">{stats.totalReferrals}</p>
                <p className="mt-1 text-xs text-muted-500">{t('friendsJoined')}</p>
              </div>
              <div className="h-10 w-px bg-line" />
              <div className="text-center">
                <p className="font-serif text-2xl font-bold text-ember-500">{stats.totalEarned}</p>
                <p className="mt-1 text-xs text-muted-500">{t('creditsEarned')}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="mt-8">
        <h3 className="mb-4 font-serif text-lg font-bold text-ink-900">{t('howItWorks')}</h3>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ember-500 text-sm font-bold text-paper-50">1</span>
            <div>
              <p className="text-sm font-semibold text-ink-900">{t('step1Title')}</p>
              <p className="mt-0.5 text-xs text-muted-500">{t('step1Desc')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ember-500 text-sm font-bold text-paper-50">2</span>
            <div>
              <p className="text-sm font-semibold text-ink-900">{t('step2Title')}</p>
              <p className="mt-0.5 text-xs text-muted-500">{t('step2Desc')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ember-500 text-sm font-bold text-paper-50">3</span>
            <div>
              <p className="text-sm font-semibold text-ink-900">{t('step3Title')}</p>
              <p className="mt-0.5 text-xs text-muted-500">{t('step3Desc')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ember-500 text-sm font-bold text-paper-50">4</span>
            <div>
              <p className="text-sm font-semibold text-ink-900">{t('step4Title')}</p>
              <p className="mt-0.5 text-xs text-muted-500">{t('step4Desc')}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
