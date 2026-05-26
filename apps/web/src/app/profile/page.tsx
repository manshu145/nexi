'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { EXAM_BY_SLUG } from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type StoredUser } from '~/lib/api';

function Row({ label, value }: { label: string; value?: string | null }) {
  return (<div className="flex items-center justify-between border-b border-line py-3">
    <span className="text-sm text-muted-500">{label}</span>
    <span className="text-sm font-medium capitalize text-ink-900">{value || '—'}</span>
  </div>);
}

export default function ProfilePage() {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const { user, loading } = useAuth();
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


  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);
  useEffect(() => { if (!user) return; (async () => { try { const r = await api.me(); setMe(r.user); setName(r.user.name); setPhone(r.user.phone ?? ''); setDob(r.user.dob ?? ''); setSchool(r.user.school ?? ''); setAim(r.user.aim ?? ''); } catch { toast.error('Failed to load'); } finally { setPageLoading(false); } })(); }, [user]);

  const handleSave = async () => { setSaving(true); try { const r = await api.updateProfile({ name: name.trim(), phone: phone.trim()||undefined, dob: dob||undefined, school: school.trim()||undefined, aim: aim.trim()||undefined }); setMe(r.user); setEditing(false); toast.success(t('saved')); } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); } finally { setSaving(false); } };

  if (loading || !user || pageLoading) return <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-16 animate-pulse"><div className="flex items-center justify-between"><div className="h-6 w-16 rounded bg-paper-200 dark:bg-ink-700" /><div className="h-6 w-20 rounded bg-paper-200 dark:bg-ink-700" /></div><div className="mt-6 flex flex-col items-center space-y-3"><div className="h-16 w-16 rounded-full bg-paper-200 dark:bg-ink-700" /><div className="h-5 w-32 rounded bg-paper-200 dark:bg-ink-700" /><div className="h-4 w-40 rounded bg-paper-200 dark:bg-ink-700" /></div><div className="mt-8 space-y-3">{[1,2,3,4,5].map(i=><div key={i} className="h-10 w-full rounded bg-paper-200 dark:bg-ink-700" />)}</div></main>;
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
            <span className={`pill text-xs ${me?.plan === 'free' ? '' : 'bg-gold-500/20 text-gold-700'}`}>
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
              <div className="h-full rounded-full bg-gold-500 transition-all" style={{ width: `${Math.min(100, ((me?.credits ?? 0) / 200) * 100)}%` }} />
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
        <div className="mt-3 paper-card p-4 space-y-3">
          <p className="text-sm text-muted-500">Invite friends and earn <span className="font-bold text-ink-900">50 credits</span> for each referral!</p>
          <div className="flex items-center gap-2">
            <input type="text" readOnly value={`https://app.nexigrate.com/signin?ref=YOUR_CODE`} className="input flex-1 text-xs" />
            <button onClick={() => { navigator.clipboard.writeText(`https://app.nexigrate.com/signin?ref=YOUR_CODE`); toast.success('Copied!'); }} className="btn-ghost-sm text-xs">Copy</button>
          </div>
          <p className="text-xs text-muted-400">Your referral code will appear after you verify your account.</p>
        </div>
      </section>
    </main>
  );
}
