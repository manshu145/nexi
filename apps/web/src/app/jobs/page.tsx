'use client';

/**
 * Jobs & Eligibility feed.
 *
 * The one question this page answers: "which jobs am I actually eligible
 * for?" — and, crucially, WHY. Every card carries a verdict badge and, when
 * the answer is no or unknown, the specific reason.
 *
 * Design decisions worth noting:
 *   - A NOT_ELIGIBLE card is never hidden. Students still get the official
 *     notification link, because our reading of a rule can be wrong and the
 *     source document is the authority.
 *   - PROFILE_INCOMPLETE is treated as an invitation, not a failure: the card
 *     names the missing field and links to the profile. This is the
 *     progressive-profiling loop — we ask for a field only when a real
 *     vacancy needs it.
 *   - Government verdicts show a statutory badge; private roles show a fit
 *     score instead, so we never dress up an employer's shortlisting
 *     decision as a legal eligibility guarantee.
 *
 * Brand tokens only (paper / ink / ember / muted / line / gold).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api, type JobCard, type EligibilityStatusUI, type JobsForYouResponse } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';
import { track } from '~/lib/analytics';

type Tab = 'for-you' | 'government' | 'private' | 'saved';

const TABS: Array<{ id: Tab; en: string; hi: string }> = [
  { id: 'for-you', en: 'For You', hi: 'आपके लिए' },
  { id: 'government', en: 'Government', hi: 'सरकारी' },
  { id: 'private', en: 'Private', hi: 'प्राइवेट' },
  { id: 'saved', en: 'Saved', hi: 'सहेजे गए' },
];

const GOVT_SECTORS = 'CENTRAL_GOVT,STATE_GOVT,UT_GOVT,PSU,BANKING,RAILWAY,DEFENCE,JUDICIARY,UNIVERSITY';
const PRIVATE_SECTORS = 'PRIVATE,STARTUP,MNC,INTERNSHIP';

/** Verdict presentation: icon, label and tone per status. */
const VERDICT: Record<EligibilityStatusUI, { icon: string; en: string; hi: string; tone: string }> = {
  ELIGIBLE: { icon: '✅', en: 'Eligible', hi: 'पात्र', tone: 'bg-emerald-500/10 text-emerald-700' },
  CONDITIONALLY_ELIGIBLE: { icon: '⚠️', en: 'Check condition', hi: 'शर्त देखें', tone: 'bg-gold-500/15 text-gold-700' },
  PROFILE_INCOMPLETE: { icon: '📝', en: 'Need info', hi: 'जानकारी चाहिए', tone: 'bg-ember-500/10 text-ember-700' },
  MANUAL_REVIEW: { icon: '🔍', en: 'Under review', hi: 'समीक्षा में', tone: 'bg-muted-500/10 text-muted-600' },
  NOT_ELIGIBLE: { icon: '❌', en: 'Not eligible', hi: 'पात्र नहीं', tone: 'bg-red-500/10 text-red-700' },
};

/** Human label for a profile field key, used in the "add this" prompt. */
const FIELD_LABEL: Record<string, { en: string; hi: string }> = {
  dateOfBirth: { en: 'date of birth', hi: 'जन्म तिथि' },
  education: { en: 'education', hi: 'शिक्षा' },
  'education.discipline': { en: 'stream / specialisation', hi: 'स्ट्रीम' },
  'education.percentage': { en: 'marks', hi: 'अंक' },
  'education.cgpa': { en: 'CGPA', hi: 'CGPA' },
  'education.subjects': { en: '12th subjects', hi: '12वीं के विषय' },
  'education.resultDate': { en: 'result date', hi: 'रिज़ल्ट की तारीख' },
  'education.graduationYear': { en: 'graduation year', hi: 'स्नातक वर्ष' },
  experience: { en: 'work experience', hi: 'कार्य अनुभव' },
  skills: { en: 'skills', hi: 'कौशल' },
  domicileState: { en: 'domicile state', hi: 'मूल निवास राज्य' },
  domicileDistrict: { en: 'domicile district', hi: 'मूल निवास ज़िला' },
  category: { en: 'category', hi: 'श्रेणी' },
  gender: { en: 'gender', hi: 'लिंग' },
  nationality: { en: 'nationality', hi: 'राष्ट्रीयता' },
  languages: { en: 'languages', hi: 'भाषाएँ' },
  hasDrivingLicence: { en: 'driving licence', hi: 'ड्राइविंग लाइसेंस' },
};

function fieldLabel(key: string, isHi: boolean): string {
  const entry = FIELD_LABEL[key];
  if (entry) return isHi ? entry.hi : entry.en;
  // exams.GATE → "GATE score"
  if (key.startsWith('exams.')) return `${key.slice(6)} ${isHi ? 'स्कोर' : 'score'}`;
  if (key.startsWith('physical.')) return isHi ? 'शारीरिक माप' : 'physical measurements';
  if (key.startsWith('speeds.')) return isHi ? 'टाइपिंग गति' : 'typing speed';
  return key;
}

/** Trust badge so provenance is always visible before the user applies. */
function trustLabel(level: string, isHi: boolean): { text: string; tone: string } {
  switch (level) {
    case 'LEVEL_1':
      return { text: isHi ? 'आधिकारिक स्रोत' : 'Official source', tone: 'text-emerald-700' };
    case 'LEVEL_2':
      return { text: isHi ? 'कंपनी करियर पेज' : 'Company career page', tone: 'text-ink-700' };
    case 'LEVEL_3':
      return { text: isHi ? 'अधिकृत पार्टनर' : 'Authorised partner', tone: 'text-muted-600' };
    default:
      return { text: isHi ? 'तीसरे पक्ष की लिस्टिंग — सत्यापित करें' : 'Third-party listing — verify', tone: 'text-gold-700' };
  }
}

function formatSalary(salary: JobCard['salary']): string | null {
  if (!salary || (salary.min === undefined && salary.max === undefined)) return null;
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  if (salary.min !== undefined && salary.max !== undefined) return `${fmt(salary.min)}–${fmt(salary.max)}`;
  return fmt((salary.min ?? salary.max)!);
}

export default function JobsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { user: me } = useUser();

  const [tab, setTab] = useState<Tab>('for-you');
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [summary, setSummary] = useState<JobsForYouResponse['summary'] | null>(null);
  const [completeness, setCompleteness] = useState<JobsForYouResponse['completeness'] | null>(null);
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isHi = me?.language === 'hi';

  useEffect(() => {
    if (!authLoading && !user) router.replace('/signin');
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    setState('loading');
    setErrorMsg(null);
    try {
      if (tab === 'saved') {
        const res = await api.getSavedJobs();
        setJobs(res.jobs);
        setSummary(null);
      } else if (tab === 'for-you') {
        const res = await api.getJobsForYou({ ...(search ? { search } : {}) });
        setJobs(res.jobs);
        setSummary(res.summary);
        setCompleteness(res.completeness);
      } else {
        const res = await api.getJobs({
          sector: tab === 'government' ? GOVT_SECTORS : PRIVATE_SECTORS,
          ...(search ? { search } : {}),
          ...(eligibleOnly ? { eligibleOnly: true } : {}),
        });
        setJobs(res.jobs);
        setSummary(null);
      }
      setState('ready');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, [tab, search, eligibleOnly]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  useEffect(() => {
    track('jobs_feed_view', { tab });
  }, [tab]);

  const onSave = async (job: JobCard) => {
    const saved = !!job.applicationStatus;
    // Optimistic update so the tap feels instant.
    setJobs((prev) =>
      prev.map((j) =>
        j.jobId === job.jobId ? { ...j, applicationStatus: saved ? undefined : 'SAVED' } : j,
      ),
    );
    try {
      if (saved) await api.unsaveJob(job.jobId);
      else {
        await api.saveJob(job.jobId);
        track('job_saved', { sector: job.sector });
      }
    } catch {
      void load(); // reconcile on failure
    }
  };

  if (authLoading || (state === 'loading' && jobs.length === 0)) {
    return (
      <main className="min-h-dvh bg-paper-50 pb-24">
        <div className="flex min-h-dvh items-center justify-center">
          <AILoader />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-paper-50 pb-24">
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <header>
          <h1 className="font-serif text-2xl font-bold text-ink-900">{isHi ? 'नौकरियाँ' : 'Jobs'}</h1>
          <p className="mt-1 text-sm text-muted-500">
            {isHi
              ? 'देखें आप किन नौकरियों के लिए वाकई पात्र हैं — और क्यों।'
              : 'See which jobs you are actually eligible for — and why.'}
          </p>
        </header>

        {/* Profile completeness nudge — progressive profiling entry point */}
        {completeness && completeness.percent < 100 && (
          <button
            type="button"
            onClick={() => router.push('/jobs/profile')}
            className="paper-card mt-4 flex w-full items-center gap-3 p-3 text-left"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink-900">
                {isHi ? 'करियर प्रोफ़ाइल' : 'Career Profile'}: {completeness.percent}%
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line-200">
                <div className="h-full rounded-full bg-ember-500" style={{ width: `${completeness.percent}%` }} />
              </div>
              {completeness.missing.length > 0 && (
                <p className="mt-1.5 text-xs text-muted-500">
                  {isHi ? 'जोड़ें' : 'Add'}:{' '}
                  {completeness.missing.slice(0, 3).map((m) => fieldLabel(m.key, !!isHi)).join(', ')}
                </p>
              )}
            </div>
            <span className="text-ember-500">→</span>
          </button>
        )}

        {/* Summary strip */}
        {summary && summary.total > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-700">
              {summary.eligible} {isHi ? 'पात्र' : 'eligible'}
            </span>
            {summary.needsProfile > 0 && (
              <span className="rounded-full bg-ember-500/10 px-2.5 py-1 font-semibold text-ember-700">
                {summary.needsProfile} {isHi ? 'जानकारी चाहिए' : 'need info'}
              </span>
            )}
            {summary.strongPrivateMatches > 0 && (
              <span className="rounded-full bg-ink-900/5 px-2.5 py-1 font-semibold text-ink-700">
                {summary.strongPrivateMatches} {isHi ? 'मजबूत मैच' : 'strong matches'}
              </span>
            )}
          </div>
        )}

        {/* Tabs */}
        <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-line-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-ember-500 text-ink-900'
                  : 'border-transparent text-muted-500 hover:text-ink-700'
              }`}
            >
              {isHi ? t.hi : t.en}
            </button>
          ))}
        </nav>

        {/* Search + filter */}
        <div className="mt-4 flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { track('job_search', {}); void load(); } }}
            placeholder={isHi ? 'खोजें — जैसे ग्रेजुएट, रेलवे' : 'Search — e.g. graduate, railway'}
            className="flex-1 rounded-xl border border-line-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-muted-400 focus:border-ember-500 focus:outline-none"
          />
          {tab !== 'saved' && tab !== 'for-you' && (
            <button
              type="button"
              onClick={() => { setEligibleOnly((v) => !v); track('job_filter_used', { filter: 'eligibleOnly' }); }}
              className={`whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                eligibleOnly
                  ? 'border-ember-500 bg-ember-500/10 text-ember-700'
                  : 'border-line-200 text-muted-500'
              }`}
            >
              {isHi ? 'केवल पात्र' : 'Eligible only'}
            </button>
          )}
        </div>

        {/* Results */}
        {state === 'error' && (
          <div className="paper-card mt-5 p-4">
            <p className="text-sm font-semibold text-ink-900">{isHi ? 'लोड नहीं हो सका' : 'Could not load jobs'}</p>
            {errorMsg && <p className="mt-1 text-xs text-muted-500">{errorMsg}</p>}
            <button type="button" onClick={() => void load()} className="mt-3 text-sm font-semibold text-ember-600">
              {isHi ? 'पुनः प्रयास' : 'Retry'}
            </button>
          </div>
        )}

        {state === 'ready' && jobs.length === 0 && (
          <div className="paper-card mt-5 p-6 text-center">
            <p className="text-3xl">💼</p>
            <p className="mt-2 text-sm font-semibold text-ink-900">
              {tab === 'saved'
                ? isHi ? 'कोई सहेजी गई नौकरी नहीं' : 'No saved jobs yet'
                : isHi ? 'अभी कोई नौकरी नहीं' : 'No jobs to show yet'}
            </p>
            <p className="mt-1 text-xs text-muted-500">
              {tab === 'saved'
                ? isHi ? 'नौकरियों को ♡ से सहेजें।' : 'Tap ♡ on a job to save it here.'
                : isHi
                  ? 'नई भर्तियाँ जुड़ते ही यहाँ दिखेंगी।'
                  : 'New vacancies will appear here as they are published.'}
            </p>
          </div>
        )}

        <ul className="mt-5 space-y-3">
          {jobs.map((job) => {
            const verdict = VERDICT[job.eligibility.status];
            const trust = trustLabel(job.sourceTrustLevel, !!isHi);
            const salary = formatSalary(job.salary);
            const isSaved = !!job.applicationStatus;
            return (
              <li key={job.jobId} className="paper-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-500">{job.organization}</p>
                    <h2 className="mt-0.5 font-serif text-base font-bold leading-snug text-ink-900">{job.title}</h2>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${verdict.tone}`}>
                    {verdict.icon} {isHi ? verdict.hi : verdict.en}
                  </span>
                </div>

                {/* Private roles show a fit score instead of a statutory claim */}
                {job.fit && (
                  <p className="mt-2 text-xs font-semibold text-ink-700">
                    {job.fit.score}% {isHi ? 'मैच' : 'match'}
                    {job.fit.missing.length > 0 && (
                      <span className="font-normal text-muted-500">
                        {' '}· {isHi ? 'कमी' : 'missing'}: {job.fit.missing.join(', ')}
                      </span>
                    )}
                  </p>
                )}

                {/* Why not / what's needed — never just a bare verdict */}
                {job.eligibility.status === 'NOT_ELIGIBLE' && job.eligibility.primaryBlocker && (
                  <p className="mt-2 rounded-lg bg-red-500/5 px-2.5 py-1.5 text-xs text-red-800">
                    {job.eligibility.primaryBlocker}
                  </p>
                )}
                {job.eligibility.status === 'PROFILE_INCOMPLETE' && job.eligibility.missingProfileFields.length > 0 && (
                  <button
                    type="button"
                    onClick={() => router.push('/jobs/profile')}
                    className="mt-2 block w-full rounded-lg bg-ember-500/5 px-2.5 py-1.5 text-left text-xs text-ember-800"
                  >
                    {isHi ? 'जोड़ें' : 'Add your'}{' '}
                    {job.eligibility.missingProfileFields.slice(0, 2).map((f) => fieldLabel(f, !!isHi)).join(' & ')}{' '}
                    {isHi ? '— पात्रता जाँचने के लिए' : 'to confirm eligibility'} →
                  </button>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-500">
                  {salary && <span className="font-medium text-ink-700">{salary}</span>}
                  <span>{job.locations.slice(0, 2).join(', ') || '—'}</span>
                  {job.vacancyTotal !== undefined && (
                    <span>{job.vacancyTotal} {isHi ? 'पद' : 'posts'}</span>
                  )}
                  {job.daysLeft !== null && (
                    <span className={job.daysLeft <= 3 ? 'font-semibold text-red-700' : ''}>
                      {job.daysLeft < 0
                        ? isHi ? 'बंद' : 'Closed'
                        : job.daysLeft === 0
                          ? isHi ? 'आज आखिरी दिन' : 'Closes today'
                          : `${job.daysLeft} ${isHi ? 'दिन बचे' : 'days left'}`}
                    </span>
                  )}
                </div>

                <p className={`mt-1.5 text-[11px] font-medium ${trust.tone}`}>{trust.text}</p>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { track('job_view', { sector: job.sector, eligibility: job.eligibility.status }); router.push(`/jobs/${job.jobId}`); }}
                    className="flex-1 rounded-xl bg-ink-900 px-3 py-2 text-sm font-semibold text-paper-50"
                  >
                    {isHi ? 'विवरण देखें' : 'View details'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSave(job)}
                    aria-label={isSaved ? 'Unsave' : 'Save'}
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      isSaved ? 'border-ember-500 bg-ember-500/10 text-ember-600' : 'border-line-200 text-muted-500'
                    }`}
                  >
                    {isSaved ? '♥' : '♡'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Scam-protection footer — mandatory per the product spec */}
        <p className="mt-6 rounded-xl bg-ink-900/5 p-3 text-[11px] leading-relaxed text-muted-600">
          {isHi
            ? 'Nexigrate भर्ती संस्था नहीं है और आवेदन के लिए कोई शुल्क नहीं लेता। आवेदन हमेशा आधिकारिक वेबसाइट पर ही करें। कोई भी भुगतान माँगने वाले संदेश से सावधान रहें।'
            : 'Nexigrate is not a recruiting body and never charges a fee to apply. Always apply on the official website. Be cautious of anyone asking you to pay for a job or interview.'}
        </p>
      </div>
    </main>
  );
}
