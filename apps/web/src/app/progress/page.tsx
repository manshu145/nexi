'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { MobileNav } from '~/components/MobileNav';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse, type StudyPlan } from '~/lib/api';
import { getLang, t } from '~/lib/i18n';

export default function ProgressPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const lang = getLang();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [plan, setPlan] = useState<StudyPlan | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([api.me(), api.getStudyPlan().catch(() => null)]).then(([meRes, planRes]) => {
      setMe(meRes.user);
      setPlan(planRes);
    });
  }, [user]);

  if (loading || !user) {
    return <main className="flex min-h-screen items-center justify-center"><span className="spinner" /></main>;
  }

  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-lg flex-col px-4 pt-6 pb-24 sm:max-w-2xl sm:px-6">
        <header className="flex items-center justify-between">
          <Logo />
          <button type="button" onClick={() => router.push('/dashboard')} className="btn-ghost-sm">
            {t('common.back', lang)}
          </button>
        </header>

        <h1 className="font-serif mt-6 text-2xl font-semibold text-ink-900">{t('nav.progress', lang)}</h1>

        {/* Stats */}
        <section className="mt-5 grid grid-cols-2 gap-3">
          <div className="paper-card p-4 text-center">
            <p className="text-3xl font-serif font-bold text-ink-900">{me?.currentStreak ?? 0}</p>
            <p className="text-xs text-muted-500 mt-1">{lang === 'hi' ? 'वर्तमान स्ट्रीक' : 'Current Streak'}</p>
          </div>
          <div className="paper-card p-4 text-center">
            <p className="text-3xl font-serif font-bold text-ink-900">{me?.bestStreak ?? 0}</p>
            <p className="text-xs text-muted-500 mt-1">{lang === 'hi' ? 'सर्वश्रेष्ठ स्ट्रीक' : 'Best Streak'}</p>
          </div>
        </section>

        {/* Skill level */}
        <section className="mt-5 paper-card p-5">
          <p className="text-xs font-semibold uppercase text-muted-500 tracking-wider">
            {lang === 'hi' ? 'आपका स्तर' : 'Your Level'}
          </p>
          <p className="mt-2 font-serif text-xl font-semibold capitalize text-ember-600">
            {me?.skillLevel ?? 'Not assessed'}
          </p>
          {plan && plan.weakSubjects.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-500">{lang === 'hi' ? 'कमजोर विषय' : 'Weak subjects'}:</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {plan.weakSubjects.map((s) => <span key={s} className="pill-warn text-xs">{s}</span>)}
              </div>
            </div>
          )}
          {plan && plan.strongSubjects.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted-500">{lang === 'hi' ? 'मजबूत विषय' : 'Strong subjects'}:</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {plan.strongSubjects.map((s) => <span key={s} className="pill-success text-xs">{s}</span>)}
              </div>
            </div>
          )}
        </section>

        {/* Study Plan */}
        {plan && plan.studyPlan.length > 0 && (
          <section className="mt-5 paper-card p-5">
            <p className="text-xs font-semibold uppercase text-muted-500 tracking-wider">
              {lang === 'hi' ? 'अध्ययन प्लान' : 'Study Plan'}
            </p>
            <ul className="mt-3 space-y-2">
              {plan.studyPlan.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-800">
                  <span className="text-ember-600 font-bold">{i + 1}.</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Recommendations */}
        {plan && plan.recommendations.length > 0 && (
          <section className="mt-5 paper-card p-5">
            <p className="text-xs font-semibold uppercase text-muted-500 tracking-wider">
              {lang === 'hi' ? 'सुझाव' : 'Recommendations'}
            </p>
            <ul className="mt-3 space-y-2">
              {plan.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-ink-800">
                  <span className="text-ember-600">→</span> {rec}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <MobileNav />
    </>
  );
}
