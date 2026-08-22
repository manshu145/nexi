'use client';

/**
 * Career Profile editor.
 *
 * This is the "fill it once" surface that makes the whole Jobs feature work.
 * Without a date of birth and at least one qualification, every vacancy
 * reports PROFILE_INCOMPLETE — so this page is the entry point to real
 * eligibility answers, not an optional extra.
 *
 * Two things it deliberately does NOT do:
 *   - It never asks for Aadhaar, PAN, bank details or certificate uploads.
 *     None of those are needed to evaluate eligibility.
 *   - It never asks for age. Only date of birth is collected, because every
 *     recruitment reckons age against its own cutoff date.
 *
 * Category / PwBD data sits behind an explicit consent toggle with the
 * purpose stated inline, because it is only used to compute relaxations.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';
import { INDIAN_STATES } from '@nexigrate/shared';
import { track } from '~/lib/analytics';

const LEVELS = [
  { id: 'CLASS_10', en: '10th', hi: '10वीं' },
  { id: 'CLASS_12', en: '12th', hi: '12वीं' },
  { id: 'ITI', en: 'ITI', hi: 'ITI' },
  { id: 'DIPLOMA', en: 'Diploma', hi: 'डिप्लोमा' },
  { id: 'BACHELORS', en: "Bachelor's", hi: 'स्नातक' },
  { id: 'MASTERS', en: "Master's", hi: 'परास्नातक' },
  { id: 'PHD', en: 'PhD', hi: 'पीएचडी' },
] as const;

const CATEGORIES = ['GENERAL', 'EWS', 'OBC', 'OBC_NCL', 'SC', 'ST'] as const;

interface EduRow {
  id?: string;
  level: string;
  degree: string;
  discipline: string;
  graduationYear: string;
  percentage: string;
  completed: boolean;
}

interface ExpRow {
  id?: string;
  role: string;
  company: string;
  startDate: string;
  endDate: string;
  current: boolean;
}

const CONSENT_PURPOSE = 'Determining job eligibility and applicable age relaxations';

export default function CareerProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: me } = useUser();
  const isHi = me?.language === 'hi';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);

  const [dob, setDob] = useState('');
  const [nationality, setNationality] = useState('Indian');
  const [gender, setGender] = useState('');
  const [domicileState, setDomicileState] = useState('');
  const [category, setCategory] = useState('');
  const [consent, setConsent] = useState(false);
  const [skills, setSkills] = useState('');
  const [education, setEducation] = useState<EduRow[]>([]);
  const [experience, setExperience] = useState<ExpRow[]>([]);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/signin');
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    try {
      const res = await api.getCareerProfile();
      const p = res.profile as Record<string, any>;
      setDob(typeof p.dateOfBirth === 'string' ? p.dateOfBirth : '');
      setNationality(typeof p.nationality === 'string' ? p.nationality : 'Indian');
      setGender(typeof p.gender === 'string' ? p.gender : '');
      setDomicileState(typeof p.domicileState === 'string' ? p.domicileState : '');
      setCategory(typeof p.category === 'string' ? p.category : '');
      setConsent(p.sensitiveDataConsent?.granted === true);
      setSkills(Array.isArray(p.skills) ? p.skills.join(', ') : '');
      setEducation(
        (Array.isArray(p.education) ? p.education : []).map((e: any) => ({
          id: e.id,
          level: e.level ?? 'BACHELORS',
          degree: e.degree ?? '',
          discipline: e.discipline ?? '',
          graduationYear: e.graduationYear ? String(e.graduationYear) : '',
          percentage: e.percentage !== undefined ? String(e.percentage) : '',
          completed: e.completed !== false,
        })),
      );
      setExperience(
        (Array.isArray(p.experience) ? p.experience : []).map((x: any) => ({
          id: x.id,
          role: x.role ?? '',
          company: x.company ?? '',
          startDate: x.startDate ?? '',
          endDate: x.endDate ?? '',
          current: x.current === true,
        })),
      );
      setPercent(res.completeness.percent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const patch: Record<string, unknown> = {
        ...(dob ? { dateOfBirth: dob } : {}),
        ...(nationality ? { nationality } : {}),
        ...(gender ? { gender } : {}),
        ...(domicileState ? { domicileState } : {}),
        skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        education: education
          .filter((e) => e.level)
          .map((e) => ({
            ...(e.id ? { id: e.id } : {}),
            level: e.level,
            ...(e.degree ? { degree: e.degree } : {}),
            ...(e.discipline ? { discipline: e.discipline } : {}),
            ...(e.graduationYear ? { graduationYear: Number(e.graduationYear) } : {}),
            ...(e.percentage ? { percentage: Number(e.percentage) } : {}),
            completed: e.completed,
            ...(e.completed ? {} : { resultAwaited: true }),
          })),
        experience: experience
          .filter((x) => x.role && x.startDate)
          .map((x) => ({
            ...(x.id ? { id: x.id } : {}),
            role: x.role,
            ...(x.company ? { company: x.company } : {}),
            startDate: x.startDate,
            ...(x.current ? { current: true } : x.endDate ? { endDate: x.endDate } : {}),
            employmentType: 'FULL_TIME',
          })),
      };
      // Category is sensitive: only send it alongside recorded consent.
      if (category && consent) {
        patch.category = category;
        patch.sensitiveDataConsent = { granted: true, purpose: CONSENT_PURPOSE };
      }

      const res = await api.updateCareerProfile(patch);
      setPercent(res.completeness.percent);
      setSaved(true);
      track('career_profile_updated', {});
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <main className="min-h-dvh bg-paper-50">
        <div className="flex min-h-dvh items-center justify-center"><AILoader /></div>
      </main>
    );
  }

  const input = 'w-full rounded-xl border border-line-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-muted-400 focus:border-ember-500 focus:outline-none';
  const label = 'block text-xs font-semibold text-ink-700';

  return (
    <main className="min-h-dvh bg-paper-50 pb-28">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <button type="button" onClick={() => router.push('/jobs')} className="text-sm text-muted-500">
          ← {isHi ? 'नौकरियाँ' : 'Jobs'}
        </button>

        <h1 className="mt-3 font-serif text-2xl font-bold text-ink-900">
          {isHi ? 'मेरी करियर प्रोफ़ाइल' : 'My Career Profile'}
        </h1>
        <p className="mt-1 text-sm text-muted-500">
          {isHi
            ? 'एक बार भरें — हर भर्ती के लिए पात्रता अपने आप जाँची जाएगी।'
            : 'Fill this once — we check your eligibility for every vacancy automatically.'}
        </p>

        <div className="paper-card mt-4 p-3">
          <p className="text-xs font-semibold text-ink-900">{percent}% {isHi ? 'पूर्ण' : 'complete'}</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line-200">
            <div className="h-full rounded-full bg-ember-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>

        {/* Basics */}
        <section className="paper-card mt-4 space-y-3 p-4">
          <h2 className="font-serif text-base font-bold text-ink-900">{isHi ? 'बुनियादी जानकारी' : 'Basics'}</h2>
          <div>
            <label className={label} htmlFor="dob">{isHi ? 'जन्म तिथि' : 'Date of birth'}</label>
            <input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={`${input} mt-1`} />
            <p className="mt-1 text-[11px] text-muted-500">
              {isHi
                ? 'हर भर्ती की अपनी कट-ऑफ तिथि होती है, इसलिए हम उम्र नहीं, जन्म तिथि रखते हैं।'
                : 'Each recruitment has its own cutoff date, so we store your date of birth rather than an age.'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="nat">{isHi ? 'राष्ट्रीयता' : 'Nationality'}</label>
              <input id="nat" value={nationality} onChange={(e) => setNationality(e.target.value)} className={`${input} mt-1`} />
            </div>
            <div>
              <label className={label} htmlFor="gen">{isHi ? 'लिंग' : 'Gender'}</label>
              <select id="gen" value={gender} onChange={(e) => setGender(e.target.value)} className={`${input} mt-1`}>
                <option value="">{isHi ? 'चुनें' : 'Select'}</option>
                <option value="MALE">{isHi ? 'पुरुष' : 'Male'}</option>
                <option value="FEMALE">{isHi ? 'महिला' : 'Female'}</option>
                <option value="TRANSGENDER">{isHi ? 'ट्रांसजेंडर' : 'Transgender'}</option>
                <option value="PREFER_NOT_TO_SAY">{isHi ? 'नहीं बताना' : 'Prefer not to say'}</option>
              </select>
            </div>
          </div>
          <div>
            <label className={label} htmlFor="dom">{isHi ? 'मूल निवास राज्य' : 'Domicile state'}</label>
            <select id="dom" value={domicileState} onChange={(e) => setDomicileState(e.target.value)} className={`${input} mt-1`}>
              <option value="">{isHi ? 'चुनें' : 'Select'}</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.slug} value={s.slug}>{isHi ? s.nameHi : s.name}</option>
              ))}
            </select>
          </div>
        </section>

        {/* Category — consent gated */}
        <section className="paper-card mt-4 space-y-3 p-4">
          <h2 className="font-serif text-base font-bold text-ink-900">{isHi ? 'श्रेणी' : 'Category'}</h2>
          <p className="text-[11px] leading-relaxed text-muted-500">
            {isHi
              ? 'हम इस जानकारी का उपयोग केवल पात्रता और आयु छूट की गणना के लिए करते हैं।'
              : 'We use this information only to determine job eligibility and applicable relaxations.'}
          </p>
          <label className="flex items-start gap-2 text-xs text-ink-700">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>{isHi ? 'मैं इस उद्देश्य के लिए सहमति देता/देती हूँ।' : 'I consent to this data being used for that purpose.'}</span>
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={!consent}
            className={`${input} ${!consent ? 'opacity-50' : ''}`}
          >
            <option value="">{isHi ? 'चुनें' : 'Select'}</option>
            {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat.replace('_', '-')}</option>)}
          </select>
        </section>

        {/* Education */}
        <section className="paper-card mt-4 space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-base font-bold text-ink-900">{isHi ? 'शिक्षा' : 'Education'}</h2>
            <button
              type="button"
              onClick={() => setEducation((p) => [...p, { level: 'BACHELORS', degree: '', discipline: '', graduationYear: '', percentage: '', completed: true }])}
              className="text-xs font-semibold text-ember-600"
            >
              + {isHi ? 'जोड़ें' : 'Add'}
            </button>
          </div>
          {education.length === 0 && (
            <p className="text-xs text-muted-500">{isHi ? 'कोई योग्यता नहीं जोड़ी गई।' : 'No qualifications added yet.'}</p>
          )}
          {education.map((row, i) => (
            <div key={row.id ?? i} className="space-y-2 rounded-xl border border-line-200 p-3">
              <div className="flex items-center justify-between">
                <select
                  value={row.level}
                  onChange={(e) => setEducation((p) => p.map((r, j) => (j === i ? { ...r, level: e.target.value } : r)))}
                  className="rounded-lg border border-line-200 bg-white px-2 py-1 text-xs font-semibold text-ink-900"
                >
                  {LEVELS.map((l) => <option key={l.id} value={l.id}>{isHi ? l.hi : l.en}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setEducation((p) => p.filter((_, j) => j !== i))}
                  className="text-xs text-muted-400"
                >
                  {isHi ? 'हटाएँ' : 'Remove'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder={isHi ? 'डिग्री (B.Tech)' : 'Degree (B.Tech)'}
                  value={row.degree}
                  onChange={(e) => setEducation((p) => p.map((r, j) => (j === i ? { ...r, degree: e.target.value } : r)))}
                  className={input}
                />
                <input
                  placeholder={isHi ? 'स्ट्रीम' : 'Stream / subject'}
                  value={row.discipline}
                  onChange={(e) => setEducation((p) => p.map((r, j) => (j === i ? { ...r, discipline: e.target.value } : r)))}
                  className={input}
                />
                <input
                  placeholder={isHi ? 'वर्ष' : 'Year'}
                  inputMode="numeric"
                  value={row.graduationYear}
                  onChange={(e) => setEducation((p) => p.map((r, j) => (j === i ? { ...r, graduationYear: e.target.value } : r)))}
                  className={input}
                />
                <input
                  placeholder={isHi ? 'प्रतिशत' : 'Percentage'}
                  inputMode="decimal"
                  value={row.percentage}
                  onChange={(e) => setEducation((p) => p.map((r, j) => (j === i ? { ...r, percentage: e.target.value } : r)))}
                  className={input}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-ink-700">
                <input
                  type="checkbox"
                  checked={row.completed}
                  onChange={(e) => setEducation((p) => p.map((r, j) => (j === i ? { ...r, completed: e.target.checked } : r)))}
                />
                {isHi ? 'पूर्ण (रिज़ल्ट घोषित)' : 'Completed (result declared)'}
              </label>
            </div>
          ))}
        </section>

        {/* Experience */}
        <section className="paper-card mt-4 space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-base font-bold text-ink-900">{isHi ? 'कार्य अनुभव' : 'Work experience'}</h2>
            <button
              type="button"
              onClick={() => setExperience((p) => [...p, { role: '', company: '', startDate: '', endDate: '', current: false }])}
              className="text-xs font-semibold text-ember-600"
            >
              + {isHi ? 'जोड़ें' : 'Add'}
            </button>
          </div>
          {experience.length === 0 && (
            <p className="text-xs text-muted-500">
              {isHi ? 'फ्रेशर हैं तो खाली छोड़ दें।' : 'Leave empty if you are a fresher.'}
            </p>
          )}
          {experience.map((row, i) => (
            <div key={row.id ?? i} className="space-y-2 rounded-xl border border-line-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  placeholder={isHi ? 'पद' : 'Role'}
                  value={row.role}
                  onChange={(e) => setExperience((p) => p.map((r, j) => (j === i ? { ...r, role: e.target.value } : r)))}
                  className={input}
                />
                <button
                  type="button"
                  onClick={() => setExperience((p) => p.filter((_, j) => j !== i))}
                  className="shrink-0 text-xs text-muted-400"
                >
                  {isHi ? 'हटाएँ' : 'Remove'}
                </button>
              </div>
              <input
                placeholder={isHi ? 'कंपनी' : 'Company'}
                value={row.company}
                onChange={(e) => setExperience((p) => p.map((r, j) => (j === i ? { ...r, company: e.target.value } : r)))}
                className={input}
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-500">{isHi ? 'शुरू' : 'Start'}</label>
                  <input
                    type="date"
                    value={row.startDate}
                    onChange={(e) => setExperience((p) => p.map((r, j) => (j === i ? { ...r, startDate: e.target.value } : r)))}
                    className={input}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-500">{isHi ? 'समाप्त' : 'End'}</label>
                  <input
                    type="date"
                    value={row.endDate}
                    disabled={row.current}
                    onChange={(e) => setExperience((p) => p.map((r, j) => (j === i ? { ...r, endDate: e.target.value } : r)))}
                    className={`${input} ${row.current ? 'opacity-50' : ''}`}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-ink-700">
                <input
                  type="checkbox"
                  checked={row.current}
                  onChange={(e) => setExperience((p) => p.map((r, j) => (j === i ? { ...r, current: e.target.checked } : r)))}
                />
                {isHi ? 'अभी कार्यरत' : 'Currently working here'}
              </label>
            </div>
          ))}
        </section>

        {/* Skills */}
        <section className="paper-card mt-4 space-y-2 p-4">
          <h2 className="font-serif text-base font-bold text-ink-900">{isHi ? 'कौशल' : 'Skills'}</h2>
          <input
            placeholder={isHi ? 'कॉमा से अलग करें — React, Excel, Tally' : 'Comma separated — React, Excel, Tally'}
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            className={input}
          />
        </section>

        {error && (
          <p className="mt-4 rounded-xl bg-red-500/5 p-3 text-xs text-red-800">{error}</p>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-muted-500">
          {isHi
            ? 'हम आधार, PAN, बैंक विवरण या प्रमाणपत्र नहीं मांगते। यह जानकारी केवल पात्रता जाँचने के लिए है।'
            : 'We never ask for Aadhaar, PAN, bank details or certificate uploads. This information is used only to check your eligibility.'}
        </p>
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-line-200 bg-paper-50/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex-1 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-paper-50 disabled:opacity-60"
          >
            {saving ? (isHi ? 'सहेजा जा रहा है…' : 'Saving…') : (isHi ? 'सहेजें' : 'Save profile')}
          </button>
          {saved && <span className="text-sm font-semibold text-emerald-700">✓ {isHi ? 'सहेजा गया' : 'Saved'}</span>}
        </div>
      </div>
    </main>
  );
}
