'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { EXAM_BY_SLUG } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type StoredUser, type ReferralStats } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';

function Row({ label, value }: { label: string; value?: string | null }) {
  return (<div className="flex items-center justify-between border-b border-line py-3">
    <span className="text-sm text-muted-500">{label}</span>
    <span className="text-sm font-medium capitalize text-ink-900">{value || '—'}</span>
  </div>);
}

export default function ProfilePage() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<StoredUser | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [school, setSchool] = useState('');
  const [aim, setAim] = useState('');
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);
  useEffect(() => { if (!user) return; (async () => { try { const r = await api.me(); setMe(r.user); setName(r.user.name); setPhone(r.user.phone ?? ''); setDob(r.user.dob ?? ''); setSchool(r.user.school ?? ''); setAim(r.user.aim ?? ''); } catch { toast.error('Failed to load'); } finally { setPageLoading(false); } })(); }, [user]);

  // Fetch referral stats
  useEffect(() => {
    if (!user) return;
    api.getReferralStats().then(setReferralStats).catch(() => {
      // Set empty stats so UI doesn't show "Loading..." forever
      setReferralStats({ code: '', referralUrl: '', totalReferrals: 0, pendingReferrals: 0, completedReferrals: 0, totalEarned: 0 });
    });
  }, [user]);

  const handleSave = async () => { setSaving(true); try { const r = await api.updateProfile({ name: name.trim(), phone: phone.trim()||undefined, dob: dob||undefined, school: school.trim()||undefined, aim: aim.trim()||undefined }); setMe(r.user); setEditing(false); toast.success(t('saved')); } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); } finally { setSaving(false); } };

  if (loading || !user || pageLoading) return <main className="flex min-h-dvh items-center justify-center"><AILoader context="general" /></main>;
  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name ?? me.targetExam : '—';

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-16">
      <header className="flex items-center justify-between"><button type="button" onClick={() => router.back()} className="btn-ghost-sm">← {tc('back')}</button><Logo /></header>
      <section className="mt-6 text-center">
        <div className="mx-auto h-16 w-16 overflow-hidden rounded-full bg-paper-200 border border-line">{me?.photoURL ? <img src={me.photoURL} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-xl font-bold text-ink-800">{me?.name?.[0]?.toUpperCase()}</span>}</div>
        <h1 className="font-serif mt-3 text-xl font-semibold text-ink-900">{me?.name}</h1>
        <p className="text-sm text-muted-500">{me?.email}</p>
      </section>
      <section className="mt-8">
        <div className="flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('personalInfo')}</h2>{!editing && <button type="button" onClick={() => setEditing(true)} className="btn-ghost-sm text-ember-500">{t('editProfile')}</button>}</div>
        {editing ? (
          <div className="mt-4 space-y-3">
            <div><label className="mb-1 block text-xs font-medium text-muted-500">{t('name')}</label><input type="text" value={name} onChange={e=>setName(e.target.value)} className="input" /></div>
            <div><label className="mb-1 block text-xs font-medium text-muted-500">{t('phone')}</label><input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="input" /></div>
            <div><label className="mb-1 block text-xs font-medium text-muted-500">{t('dob')}</label><input type="date" value={dob} onChange={e=>setDob(e.target.value)} className="input" /></div>
            <div><label className="mb-1 block text-xs font-medium text-muted-500">{t('school')}</label><input type="text" value={school} onChange={e=>setSchool(e.target.value)} className="input" /></div>
            <div><label className="mb-1 block text-xs font-medium text-muted-500">{t('aim')}</label><input type="text" value={aim} onChange={e=>setAim(e.target.value)} className="input" /></div>
            <div className="flex gap-2 pt-2"><button type="button" onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? tc('loading') : tc('save')}</button><button type="button" onClick={() => setEditing(false)} className="btn-ghost flex-1">{tc('cancel')}</button></div>
          </div>
        ) : (
          <div className="mt-3"><Row label={t('name')} value={me?.name} /><Row label={t('email')} value={me?.email} /><Row label={t('phone')} value={me?.phone} /><Row label={t('dob')} value={me?.dob} /><Row label={t('school')} value={me?.school} /><Row label={t('aim')} value={me?.aim} /></div>
        )}
      </section>
      <section className="mt-6"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('academicInfo')}</h2><div className="mt-3"><Row label={t('targetExam')} value={examName} /><Row label={t('level')} value={me?.onboardingLevel} /></div></section>

      {/* Language Preference */}
      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">Language / भाषा</h2>
        <div className="mt-3 paper-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-900">Content Language</p>
              <p className="text-xs text-muted-500">Chapters, quizzes & AI responses</p>
            </div>
            <div className="flex rounded-lg bg-paper-200 p-1">
              <button
                onClick={() => { localStorage.setItem('nexigrate-language', 'en'); document.cookie = 'nexigrate-language=en;path=/;max-age=31536000'; toast.success('Language set to English'); window.location.reload(); }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${(localStorage.getItem('nexigrate-language') || 'en') === 'en' ? 'bg-paper-50 text-ink-900 shadow-sm' : 'text-muted-500'}`}
              >
                English
              </button>
              <button
                onClick={() => { localStorage.setItem('nexigrate-language', 'hi'); document.cookie = 'nexigrate-language=hi;path=/;max-age=31536000'; toast.success('भाषा हिंदी में बदली गई'); window.location.reload(); }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${localStorage.getItem('nexigrate-language') === 'hi' ? 'bg-paper-50 text-ink-900 shadow-sm' : 'text-muted-500'}`}
              >
                हिंदी
              </button>
            </div>
          </div>
        </div>
      </section>
      <section className="mt-6"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">{t('accountInfo')}</h2><div className="mt-3"><Row label={t('plan')} value={me?.plan} /><Row label={t('credits')} value={String(me?.credits ?? 0)} /><Row label={t('memberSince')} value={me?.createdAt ? new Date(me.createdAt).toLocaleDateString() : '—'} /></div></section>

      {/* Plan & Billing */}
      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">Plan & Billing</h2>
        <div className="mt-3 paper-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-900 capitalize">{me?.plan ?? 'free'} Plan</p>
              <p className="text-xs text-muted-500">{me?.planExpiresAt ? `Renews on ${new Date(me.planExpiresAt).toLocaleDateString('en-IN')}` : 'Free forever'}</p>
            </div>
            <span className={`pill text-xs ${me?.plan === 'free' ? '' : 'bg-ember-500/20 text-ember-700'}`}>
              {me?.plan === 'free' ? 'Free' : 'Active'}
            </span>
          </div>
          {/* Credits progress */}
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-500">Credits</span>
              <span className="font-medium text-ink-900">{me?.credits ?? 0}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-paper-300">
              <div className="h-full rounded-full bg-ember-500 transition-all" style={{ width: `${Math.min(100, ((me?.credits ?? 0) / 200) * 100)}%` }} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => router.push('/upgrade')} className="btn-primary flex-1 text-sm">Upgrade Plan</button>
            <a href="mailto:support@nexigrate.com" className="btn-ghost flex-1 text-sm text-center">Manage Subscription</a>
          </div>
        </div>
      </section>

      {/* Refer & Earn */}
      <section className="mt-6" id="referral">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-500">Refer & Earn</h2>
        <div className="mt-3 paper-card p-4 space-y-4">
          <p className="text-sm text-muted-500">Invite friends and earn <span className="font-bold text-ink-900">50 credits</span> for each referral who completes onboarding!</p>
          
          {/* Referral Code */}
          {referralStats?.code ? (
            <>
              <div>
                <p className="text-xs font-medium text-muted-500 mb-1">Your referral code</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg bg-paper-200 px-4 py-2.5 text-center font-mono text-lg font-bold tracking-widest text-ink-900">
                    {referralStats.code}
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(referralStats.code); toast.success('Code copied!'); }} className="btn-ghost-sm text-xs">Copy</button>
                </div>
              </div>
              
              {/* Referral URL */}
              <div>
                <p className="text-xs font-medium text-muted-500 mb-1">Share this link</p>
                <div className="flex items-center gap-2">
                  <input type="text" readOnly value={referralStats.referralUrl} className="input flex-1 text-xs" />
                  <button onClick={() => { navigator.clipboard.writeText(referralStats.referralUrl); toast.success('Link copied!'); }} className="btn-ghost-sm text-xs">Copy</button>
                </div>
              </div>

              {/* Share button */}
              <button
                onClick={() => {
                  const text = `Join me on Nexigrate! Use my code ${referralStats.code} to get 25 bonus credits. ${referralStats.referralUrl}`;
                  if (navigator.share) {
                    navigator.share({ title: 'Join Nexigrate', text, url: referralStats.referralUrl }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(text);
                    toast.success('Share text copied!');
                  }
                }}
                className="btn-primary w-full text-sm"
              >
                📤 Share with Friends
              </button>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-line">
                <div className="text-center">
                  <p className="text-lg font-bold text-ink-900">{referralStats.totalReferrals}</p>
                  <p className="text-[10px] text-muted-500">Total Referrals</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-ink-900">{referralStats.completedReferrals}</p>
                  <p className="text-[10px] text-muted-500">Completed</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-ember-500">{referralStats.totalEarned}</p>
                  <p className="text-[10px] text-muted-500">Credits Earned</p>
                </div>
              </div>
            </>
          ) : referralStats !== null ? (
            <div className="text-center py-3">
              <p className="text-sm text-muted-400">Referral code not yet generated. Complete your profile to get one!</p>
            </div>
          ) : (
            <div className="text-center py-3">
              <p className="text-sm text-muted-400">Loading referral code...</p>
            </div>
          )}
        </div>
      </section>

      {/* Sign Out */}
      <section className="mt-6">
        <button onClick={() => signOut()} className="btn-ghost w-full text-sm text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20">
          Sign Out
        </button>
      </section>

      {/* Delete Account */}
      <section className="mt-4 mb-8">
        <details className="paper-card p-4">
          <summary className="text-sm font-medium text-red-500 cursor-pointer">Delete Account</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-500">This will permanently delete your account, all study progress, credits, and data. This action cannot be undone.</p>
            <button
              onClick={async () => {
                const confirmed = window.confirm('Are you sure you want to delete your account? This cannot be undone. All your data, credits, and progress will be permanently lost.');
                if (!confirmed) return;
                const doubleConfirm = window.confirm('Final confirmation: Type OK in your mind. Your account and all associated data will be deleted forever.');
                if (!doubleConfirm) return;
                try {
                  const { getFirebaseAuthClient } = await import('~/lib/firebase');
                  const auth = getFirebaseAuthClient();
                  const token = await auth.currentUser?.getIdToken();
                  const res = await fetch(`${process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com'}/v1/users/me`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  if (!res.ok) { const err = await res.json().catch(() => ({})) as {error?:string}; throw new Error(err.error || 'Failed to delete'); }
                  // Delete Firebase auth account
                  await auth.currentUser?.delete();
                  window.location.href = '/';
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Failed to delete account. Please contact support.');
                }
              }}
              className="w-full rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors"
            >
              Permanently Delete My Account
            </button>
          </div>
        </details>
      </section>
    </main>
  );
}
