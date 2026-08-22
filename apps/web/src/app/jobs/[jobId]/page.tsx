'use client';

/**
 * Job detail — the "Why this result?" surface.
 *
 * This page carries the product's central trust claim: for a government
 * vacancy we do not just say eligible/not eligible, we show the full rule
 * table (what the notification demands, what the candidate has, and the
 * verdict per rule) and link to the official document behind it.
 *
 * The Apply button always goes to the OFFICIAL site. Nexigrate never
 * collects an application or a fee, and says so.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api, type JobDetailResponse, type RuleStatusUI, type EligibilityStatusUI } from '~/lib/api';
import { AILoader } from '~/components/ui/AILoader';
import { track } from '~/lib/analytics';

const VERDICT: Record<EligibilityStatusUI, { icon: string; en: string; hi: string; tone: string }> = {
  ELIGIBLE: { icon: '✅', en: 'You appear eligible to apply', hi: 'आप आवेदन के पात्र प्रतीत होते हैं', tone: 'bg-emerald-500/10 text-emerald-800' },
  CONDITIONALLY_ELIGIBLE: { icon: '⚠️', en: 'Eligible, subject to a condition', hi: 'पात्र, लेकिन एक शर्त के अधीन', tone: 'bg-gold-500/15 text-gold-800' },
  PROFILE_INCOMPLETE: { icon: '📝', en: 'We need one more detail', hi: 'एक जानकारी चाहिए', tone: 'bg-ember-500/10 text-ember-800' },
  MANUAL_REVIEW: { icon: '🔍', en: 'This notification needs manual checking', hi: 'यह अधिसूचना मैन्युअल जाँच चाहती है', tone: 'bg-muted-500/10 text-muted-700' },
  NOT_ELIGIBLE: { icon: '❌', en: 'You are currently not eligible', hi: 'आप अभी पात्र नहीं हैं', tone: 'bg-red-500/10 text-red-800' },
};

const RULE_MARK: Record<RuleStatusUI, { mark: string; tone: string }> = {
  PASS: { mark: '✓', tone: 'text-emerald-700' },
  FAIL: { mark: '✕', tone: 'text-red-700' },
  UNKNOWN: { mark: '?', tone: 'text-ember-700' },
  CONDITIONAL: { mark: '~', tone: 'text-gold-700' },
  NOT_APPLICABLE: { mark: '—', tone: 'text-muted-400' },
};

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params?.jobId;
  const { user, loading: authLoading } = useAuth();
  const { user: me } = useUser();
  const isHi = me?.language === 'hi';

  const [data, setData] = useState<JobDetailResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [askedApplied, setAskedApplied] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/signin');
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    if (!jobId) return;
    setState('loading');
    try {
      const res = await api.getJobDetail(jobId);
      setData(res);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, [jobId]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  const onApply = () => {
    if (!data) return;
    const url = (data.job.officialApplyUrl as string) || data.job.officialJobUrl;
    track('official_apply_clicked', { jobId: data.job.jobId, sector: String(data.job.sector) });
    window.open(url, '_blank', 'noopener,noreferrer');
    // Ask about the outcome when they come back, so the tracker stays useful
    // without nagging up front.
    setAskedApplied(true);
  };

  const markStatus = async (status: string) => {
    if (!jobId) return;
    try {
      await api.setJobApplicationStatus(jobId, status);
      track('job_marked_applied', { status });
      setAskedApplied(false);
      void load();
    } catch { /* non-blocking */ }
  };

  if (authLoading || state === 'loading') {
    return (
      <main className="min-h-dvh bg-paper-50">
        <div className="flex min-h-dvh items-center justify-center"><AILoader /></div>
      </main>
    );
  }

  if (state === 'error' || !data) {
    return (
      <main className="min-h-dvh bg-paper-50 px-4 pt-6">
        <button type="button" onClick={() => router.push('/jobs')} className="text-sm text-muted-500">
          ← {isHi ? 'नौकरियाँ' : 'Jobs'}
        </button>
        <div className="paper-card mt-4 p-4">
          <p className="text-sm font-semibold text-ink-900">{isHi ? 'यह नौकरी नहीं मिली' : 'Job not found'}</p>
          {error && <p className="mt-1 text-xs text-muted-500">{error}</p>}
        </div>
      </main>
    );
  }

  const job = data.job as Record<string, any>;
  const verdict = VERDICT[data.eligibility.status];
  const applyUrl = (job.officialApplyUrl as string) || job.officialJobUrl;
  let applyHost = '';
  try { applyHost = new URL(applyUrl).host; } catch { applyHost = applyUrl; }

  return (
    <main className="min-h-dvh bg-paper-50 pb-28">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <button type="button" onClick={() => router.push('/jobs')} className="text-sm text-muted-500">
          ← {isHi ? 'नौकरियाँ' : 'Jobs'}
        </button>

        {/* Header */}
        <header className="mt-3">
          <p className="text-xs font-medium text-muted-500">{job.organization}</p>
          <h1 className="mt-0.5 font-serif text-2xl font-bold leading-tight text-ink-900">{job.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-500">
            <span>{String(job.sector).replace(/_/g, ' ')}</span>
            {Array.isArray(job.locations) && job.locations.length > 0 && <span>{job.locations.join(', ')}</span>}
            {data.daysLeft !== null && (
              <span className={data.daysLeft <= 3 ? 'font-semibold text-red-700' : ''}>
                {data.daysLeft < 0
                  ? isHi ? 'बंद' : 'Closed'
                  : `${data.daysLeft} ${isHi ? 'दिन बचे' : 'days left'}`}
              </span>
            )}
          </div>
        </header>

        {/* Verdict */}
        <div className={`mt-4 rounded-2xl p-4 ${verdict.tone}`}>
          <p className="font-serif text-lg font-bold">
            {verdict.icon} {isHi ? verdict.hi : verdict.en}
          </p>
          {data.eligibility.blockingReasons.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {data.eligibility.blockingReasons.map((r, i) => <li key={i}>• {r}</li>)}
            </ul>
          )}
          {data.eligibility.missingProfileFields.length > 0 && (
            <button
              type="button"
              onClick={() => router.push('/jobs/profile')}
              className="mt-2 text-sm font-semibold underline"
            >
              {isHi ? 'प्रोफ़ाइल पूरी करें' : 'Complete your profile'} →
            </button>
          )}
        </div>

        {/* Private fit */}
        {data.fit && (
          <section className="paper-card mt-4 p-4">
            <h2 className="font-serif text-base font-bold text-ink-900">
              {data.fit.score}% {isHi ? 'मैच' : 'match'} · {data.fit.band}
            </h2>
            {data.fit.matched.length > 0 && (
              <p className="mt-2 text-xs text-ink-700">
                <span className="font-semibold">{isHi ? 'आप मैच करते हैं' : 'You match'}:</span> {data.fit.matched.join(', ')}
              </p>
            )}
            {data.fit.missing.length > 0 && (
              <p className="mt-1 text-xs text-red-700">
                <span className="font-semibold">{isHi ? 'अनिवार्य कमी' : 'Missing (required)'}:</span> {data.fit.missing.join(', ')}
              </p>
            )}
            {data.fit.preferredMissing.length > 0 && (
              <p className="mt-1 text-xs text-muted-500">
                <span className="font-semibold">{isHi ? 'वरीयता (अनिवार्य नहीं)' : 'Preferred only'}:</span> {data.fit.preferredMissing.join(', ')}
              </p>
            )}
          </section>
        )}

        {/* Per-rule table — the core trust surface */}
        <section className="paper-card mt-4 p-4">
          <h2 className="font-serif text-base font-bold text-ink-900">{isHi ? 'यह परिणाम क्यों?' : 'Why this result?'}</h2>
          <div className="mt-3 space-y-2.5">
            {data.eligibility.rules
              .filter((r) => r.status !== 'NOT_APPLICABLE')
              .map((r, i) => {
                const mark = RULE_MARK[r.status];
                return (
                  <div key={i} className="border-b border-line-200 pb-2.5 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-ink-900">{r.label}</p>
                      <span className={`shrink-0 text-sm font-bold ${mark.tone}`}>{mark.mark}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-500">
                      <span className="font-medium text-ink-700">{isHi ? 'आवश्यक' : 'Required'}:</span> {r.required}
                    </p>
                    <p className="text-xs text-muted-500">
                      <span className="font-medium text-ink-700">{isHi ? 'आपके पास' : 'You have'}:</span> {r.candidate}
                    </p>
                    {r.detail && <p className="mt-1 text-xs text-ink-700">{r.detail}</p>}
                    {r.evidence?.sourceText && (
                      <p className="mt-1 border-l-2 border-line-200 pl-2 text-[11px] italic text-muted-500">
                        “{r.evidence.sourceText}”
                        {r.evidence.page !== undefined && (
                          <span className="not-italic"> — {isHi ? 'पृष्ठ' : 'Page'} {r.evidence.page}</span>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
          {data.eligibility.rules.every((r) => r.status === 'NOT_APPLICABLE') && (
            <p className="mt-2 text-xs text-muted-500">
              {isHi
                ? 'इस अधिसूचना से कोई संरचित पात्रता शर्त नहीं निकाली जा सकी — कृपया आधिकारिक दस्तावेज़ देखें।'
                : 'No structured eligibility criteria could be extracted from this notification — please read the official document.'}
            </p>
          )}
        </section>

        {/* Warnings */}
        {data.eligibility.warnings.length > 0 && (
          <section className="mt-4 rounded-xl bg-gold-500/10 p-3">
            <ul className="space-y-1 text-xs text-gold-800">
              {data.eligibility.warnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          </section>
        )}

        {/* Official documents */}
        {Array.isArray(job.sourceDocuments) && job.sourceDocuments.length > 0 && (
          <section className="paper-card mt-4 p-4">
            <h2 className="font-serif text-base font-bold text-ink-900">{isHi ? 'आधिकारिक दस्तावेज़' : 'Official documents'}</h2>
            <ul className="mt-2 space-y-1.5">
              {job.sourceDocuments.map((d: any, i: number) => (
                <li key={i}>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-ember-600 underline"
                  >
                    {d.title || d.kind} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Freshness */}
        {job.lastVerifiedAt && (
          <p className="mt-4 text-[11px] text-muted-500">
            {isHi ? 'अंतिम सत्यापन' : 'Last verified'}: {new Date(job.lastVerifiedAt).toLocaleDateString(isHi ? 'hi-IN' : 'en-IN')}
          </p>
        )}

        {/* Did you apply? */}
        {askedApplied && (
          <section className="paper-card mt-4 p-4">
            <p className="text-sm font-semibold text-ink-900">{isHi ? 'क्या आपने आवेदन किया?' : 'Did you apply?'}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void markStatus('APPLIED')} className="rounded-xl bg-ink-900 px-3 py-1.5 text-xs font-semibold text-paper-50">
                {isHi ? 'हाँ' : 'Yes'}
              </button>
              <button type="button" onClick={() => void markStatus('STARTED_APPLICATION')} className="rounded-xl border border-line-200 px-3 py-1.5 text-xs font-semibold text-muted-600">
                {isHi ? 'अभी नहीं' : 'Not yet'}
              </button>
              <button type="button" onClick={() => void markStatus('NOT_INTERESTED')} className="rounded-xl border border-line-200 px-3 py-1.5 text-xs font-semibold text-muted-600">
                {isHi ? 'रुचि नहीं' : 'Not interested'}
              </button>
            </div>
          </section>
        )}

        <p className="mt-6 rounded-xl bg-ink-900/5 p-3 text-[11px] leading-relaxed text-muted-600">
          {isHi
            ? 'आवेदन आधिकारिक वेबसाइट पर होता है। Nexigrate भर्ती संस्था नहीं है और कोई शुल्क नहीं लेता।'
            : 'Your application is submitted on the official website. Nexigrate is not the recruiting body and never charges a fee.'}
        </p>
      </div>

      {/* Sticky apply bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-line-200 bg-paper-50/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={onApply}
            className="w-full rounded-xl bg-ember-500 px-4 py-3 text-sm font-bold text-white"
          >
            {isHi ? 'आधिकारिक वेबसाइट पर आवेदन करें' : 'Apply on Official Website'} ↗
          </button>
          <p className="mt-1.5 text-center text-[11px] text-muted-500">{applyHost}</p>
        </div>
      </div>
    </main>
  );
}
