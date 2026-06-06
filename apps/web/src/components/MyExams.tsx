'use client';

/**
 * MyExams — multi-exam enrolment management (Sprint 5).
 *
 * Lets a signed-in user see every exam they're enrolled in, switch the
 * active exam, remove a secondary exam, and add a new one (subject to the
 * plan's maxExams cap, enforced server-side). When the plan limit is hit,
 * the add flow routes the user to /upgrade instead of erroring out.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EXAMS } from '@nexigrate/shared';
import { api, ApiError } from '~/lib/api';
import { useUser } from '~/lib/userStore';

const CAT_LABELS: Record<string, string> = {
  'school': 'School (Class 5-12)',
  'engineering': 'Engineering',
  'medical': 'Medical',
  'civil-services': 'Civil Services & SSC',
  'banking': 'Banking',
  'defence': 'Defence',
  'teaching': 'Teaching',
  'state': 'State Exams',
  'law': 'Law',
  'management': 'Management',
  'professional-skills': 'Professional Skills',
};

const EXAM_NAME = new Map<string, string>(EXAMS.map((e) => [e.id as string, e.name]));

function examName(slug: string | null | undefined): string {
  if (!slug) return '—';
  return EXAM_NAME.get(slug) ?? slug;
}

export default function MyExams() {
  const { user, mutate, refresh } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // action key while in-flight
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  const active = user?.targetExam ?? null;
  const secondary = useMemo(() => ((user?.secondaryExams ?? []) as string[]).filter(Boolean), [user]);
  const enrolled = useMemo(
    () => [active, ...secondary].filter(Boolean) as string[],
    [active, secondary],
  );
  const enrolledSet = useMemo(() => new Set(enrolled), [enrolled]);

  // Candidate exams for the add picker: everything not already enrolled,
  // filtered by the search query.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXAMS.filter((ex) => {
      if (enrolledSet.has(ex.id)) return false;
      if (!q) return true;
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.id.toLowerCase().includes(q) ||
        (CAT_LABELS[ex.category] ?? ex.category).toLowerCase().includes(q)
      );
    }).slice(0, 24);
  }, [query, enrolledSet]);

  if (!user) return null;

  async function runAction(action: 'add' | 'remove' | 'switch', exam: string, key: string) {
    setBusy(key);
    try {
      const { user: updated } = await api.manageExam(action, exam);
      mutate(() => updated);
      void refresh();
      if (action === 'switch') toast.success(`Switched to ${examName(exam)}`);
      if (action === 'add') { toast.success(`Added ${examName(exam)}`); setPicking(false); setQuery(''); }
      if (action === 'remove') toast.success(`Removed ${examName(exam)}`);
    } catch (err) {
      // Plan limit reached → nudge to upgrade instead of a dead-end error.
      if (err instanceof ApiError && err.status === 403) {
        toast.error(err.message || 'Upgrade your plan to add more exams.');
        router.push('/upgrade');
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="paper-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink-900">My Exams</h2>
          <p className="mt-0.5 text-xs text-muted-500">Study for multiple exams and switch anytime.</p>
        </div>
        {!picking && (
          <button type="button" onClick={() => setPicking(true)} className="btn-ghost text-sm">
            + Add exam
          </button>
        )}
      </div>

      {/* Enrolled list */}
      <ul className="mt-4 space-y-2">
        {enrolled.length === 0 && (
          <li className="rounded-xl border border-line bg-paper-50 px-4 py-3 text-sm text-muted-500">
            No exam selected yet.
          </li>
        )}
        {enrolled.map((slug) => {
          const isActive = slug === active;
          return (
            <li
              key={slug}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{examName(slug)}</p>
                {isActive ? (
                  <span className="mt-0.5 inline-block rounded-full bg-ember-500/15 px-2 py-0.5 text-[11px] font-semibold text-ember-600">
                    Active
                  </span>
                ) : (
                  <span className="mt-0.5 inline-block text-[11px] text-muted-500">Enrolled</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!isActive && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => runAction('switch', slug, `switch:${slug}`)}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    {busy === `switch:${slug}` ? '…' : 'Switch to'}
                  </button>
                )}
                {!isActive && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => runAction('remove', slug, `remove:${slug}`)}
                    aria-label={`Remove ${examName(slug)}`}
                    className="rounded-lg px-2 py-1.5 text-xs text-muted-500 hover:bg-paper-200 hover:text-ink-900"
                  >
                    {busy === `remove:${slug}` ? '…' : 'Remove'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Add picker */}
      {picking && (
        <div className="mt-4 rounded-xl border border-line bg-paper-50 p-3">
          <div className="flex items-center gap-2">
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exams… (UPSC, NEET, SSC…)"
              aria-label="Search exams to add"
              className="w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 placeholder:text-muted-400 focus:outline-none focus:ring-2 focus:ring-ember-500"
            />
            <button
              type="button"
              onClick={() => { setPicking(false); setQuery(''); }}
              className="shrink-0 rounded-lg px-3 py-2 text-xs text-muted-500 hover:bg-paper-200"
            >
              Cancel
            </button>
          </div>
          <div className="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {candidates.length === 0 ? (
              <p className="col-span-full py-4 text-center text-xs text-muted-500">
                No matching exams.
              </p>
            ) : (
              candidates.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => runAction('add', ex.id, `add:${ex.id}`)}
                  className="paper-card card-selectable px-3 py-2.5 text-left text-xs font-medium"
                >
                  {busy === `add:${ex.id}` ? 'Adding…' : ex.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
