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
  return (<div className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3 dark:border-slate-700/50"><span className="text-sm text-slate-500 dark:text-slate-400">{label}</span><span className="text-sm font-medium capitalize text-slate-900 dark:text-white">{value || 'Not set'}</span></div>);
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

  if (loading || !user || pageLoading) return <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 pt-8"><div className="skeleton h-6 w-32" /><div className="mt-8 space-y-4">{[1,2,3,4,5].map(i=><div key={i} className="skeleton h-12 w-full rounded-lg"/>)}</div></main>;
  const examName = me?.targetExam ? EXAM_BY_SLUG.get(me.targetExam)?.name ?? me.targetExam : 'Not set';

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 pt-8 pb-16">

      <header className="flex items-center justify-between"><button type="button" onClick={() => router.back()} className="btn-ghost">&larr; {tc('back')}</button><Logo /></header>
      <section className="mt-8 flex flex-col items-center">
        <div className="h-20 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">{me?.photoURL ? <img src={me.photoURL} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-slate-500">{me?.name?.[0]?.toUpperCase()}</span>}</div>
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">{me?.name}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{me?.email}</p>
      </section>
      <section className="mt-8">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('personalInfo')}</h2>{!editing && <button type="button" onClick={() => setEditing(true)} className="btn-ghost text-xs text-amber-600">{t('editProfile')}</button>}</div>
        {editing ? (
          <div className="mt-4 space-y-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-500">{t('name')}</label><input type="text" value={name} onChange={e=>setName(e.target.value)} className="input" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-500">{t('phone')}</label><input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="input" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-500">{t('dob')}</label><input type="date" value={dob} onChange={e=>setDob(e.target.value)} className="input" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-500">{t('school')}</label><input type="text" value={school} onChange={e=>setSchool(e.target.value)} className="input" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-500">{t('aim')}</label><input type="text" value={aim} onChange={e=>setAim(e.target.value)} className="input" /></div>
            <div className="flex gap-2 pt-2"><button type="button" onClick={handleSave} disabled={saving} className="btn-primary flex-1">{saving ? tc('loading') : tc('save')}</button><button type="button" onClick={() => setEditing(false)} className="btn-secondary flex-1">{tc('cancel')}</button></div>
          </div>
        ) : (
          <div className="mt-4 space-y-3"><Row label={t('name')} value={me?.name} /><Row label={t('email')} value={me?.email} /><Row label={t('phone')} value={me?.phone} /><Row label={t('dob')} value={me?.dob} /><Row label={t('school')} value={me?.school} /><Row label={t('aim')} value={me?.aim} /></div>
        )}
      </section>
      <section className="mt-8"><h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('academicInfo')}</h2><div className="mt-4 space-y-3"><Row label={t('targetExam')} value={examName} /><Row label={t('level')} value={me?.onboardingLevel} /></div></section>
      <section className="mt-8"><h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('accountInfo')}</h2><div className="mt-4 space-y-3"><Row label={t('plan')} value={me?.plan} /><Row label={t('credits')} value={String(me?.credits ?? 0)} /><Row label={t('memberSince')} value={me?.createdAt ? new Date(me.createdAt).toLocaleDateString() : 'N/A'} /></div></section>
    </main>
  );
}
