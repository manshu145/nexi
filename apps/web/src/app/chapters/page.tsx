'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type ChapterSummary, type MeResponse } from '~/lib/api';

/**
 * /chapters
 *
 * The student library, presented as a bookshelf -- one shelf per subject,
 * chapters as paper-cards lined up on it. Clicking a chapter opens the
 * Kindle-style paginated reader at /read/<exam>/<subject>/<slug>.
 *
 * The page also surfaces a "Continue reading" call-out at the top whenever
 * the student has a saved reading position from a previous session
 * (stored in localStorage by /read/[..]/page.tsx).
 */

interface ContinueReading {
  chapterId: string;
  exam: string;
  subject: string;
  slug: string;
  title: string;
  page: number;
  totalPages: number;
}

export default function ChaptersListPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [chapters, setChapters] = useState<ChapterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [continueRow, setContinueRow] = useState<ContinueReading | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const meRes = await api.me();
        if (cancelled) return;
        setMe(meRes.user);
        if (!meRes.user.targetExam) {
          router.replace('/onboarding');
          return;
        }
        const list = await api.chapters.list({ exam: meRes.user.targetExam });
        if (cancelled) return;
        setChapters(list.chapters);

        // Look for any saved reading position (the reader writes
        // localStorage["nexi.read.<chapterId>"] = page index).
        try {
          for (const ch of list.chapters) {
            const raw = window.localStorage.getItem(`nexi.read.${ch.id}`);
            if (raw == null) continue;
            const pageIdx = Number(raw);
            if (!Number.isFinite(pageIdx) || pageIdx <= 0) continue;
            const total = 1 + ch.sectionCount + 1; // cover + sections + end
            if (pageIdx >= total - 1) continue; // already finished
            // Take the first one we find -- if there are several this is
            // not perfect, but it costs nothing and looks good in 99% of
            // cases. Last-modified ordering is a follow-up.
            setContinueRow({
              chapterId: ch.id,
              exam: ch.exam,
              subject: ch.subject,
              slug: ch.slug,
              title: ch.title,
              page: pageIdx,
              totalPages: total,
            });
            break;
          }
        } catch {
          /* ignore localStorage failures (private mode, quota) */
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'failed to load chapters');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  // Group chapters by subject for the bookshelf layout.
  const shelves = useMemo(() => {
    const bySubject = new Map<string, ChapterSummary[]>();
    (chapters ?? []).forEach((c) => {
      const arr = bySubject.get(c.subject) ?? [];
      arr.push(c);
      bySubject.set(c.subject, arr);
    });
    return Array.from(bySubject.entries())
      .map(([subject, list]) => ({
        subject,
        chapters: list.slice().sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [chapters]);

  if (loading || !user) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading...
        </span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pt-6 pb-24 sm:px-6 sm:pt-8 sm:pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <Link href="/dashboard" className="btn-ghost-sm">
          Dashboard
        </Link>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Library</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Read first. Test after.
        </h1>
        <p className="mt-2 text-sm text-muted-500">
          Every chapter is generated and verified by 3 AIs (OpenAI, Gemini,
          Groq). Pick one and start reading.
        </p>
      </section>

      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {continueRow ? (
        <Link
          href={`/read/${encodeURIComponent(continueRow.exam)}/${encodeURIComponent(continueRow.subject)}/${encodeURIComponent(continueRow.slug)}`}
          className="paper-card mt-6 flex items-center justify-between gap-3 p-5 transition hover:bg-paper-200/40"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Continue reading
            </p>
            <h2 className="font-serif mt-1 truncate text-lg text-ink-900">
              {continueRow.title}
            </h2>
            <p className="mt-1 text-xs text-muted-500">
              Page {continueRow.page} of {continueRow.totalPages - 2}
            </p>
          </div>
          <span className="shrink-0 text-base text-muted-500">→</span>
        </Link>
      ) : null}

      {chapters === null ? (
        <p className="mt-8 text-sm text-muted-500">Loading library...</p>
      ) : chapters.length === 0 ? (
        <AutoGeneratedLibrary exam={me?.targetExam ?? ''} />
      ) : (
        <div className="mt-10 space-y-12">
          {shelves.map(({ subject, chapters: list }) => (
            <section key={subject}>
              <div className="flex items-baseline justify-between border-b border-ink-900/15 pb-2">
                <h2 className="font-serif text-lg font-semibold uppercase tracking-[0.12em] text-ink-900">
                  {prettySubject(subject)}
                </h2>
                <span className="text-xs text-muted-500">
                  {list.length} {list.length === 1 ? 'chapter' : 'chapters'}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {list.map((c) => (
                  <Link
                    key={c.id}
                    href={`/read/${encodeURIComponent(c.exam)}/${encodeURIComponent(c.subject)}/${encodeURIComponent(c.slug)}`}
                    className="paper-card flex items-start justify-between gap-3 p-5 transition hover:bg-paper-200/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-500">
                        {c.classLevel} · ~{c.estimatedReadMinutes} min read
                        {' · '}
                        {c.sectionCount}{' '}
                        {c.sectionCount === 1 ? 'section' : 'sections'}
                      </p>
                      <h3 className="font-serif mt-1 text-lg text-ink-900">
                        {c.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm text-ink-800">
                        {c.summary}
                      </p>
                    </div>
                    <span className="mt-1 shrink-0 text-sm text-muted-500">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function prettySubject(s: string): string {
  return s
    .split('-')
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}



/**
 * Auto-generates chapters for the student's exam.
 * Stores in localStorage so they persist between visits — no re-generation.
 */
function AutoGeneratedLibrary({ exam }: { exam: string }) {
  const [generating, setGenerating] = useState(false);
  const [chapters, setLocalChapters] = useState<Array<{
    title: string;
    sections: { heading: string; content: string }[];
    summary: string;
    keyPoints: string[];
  }>>([]);
  const [currentTopic, setCurrentTopic] = useState('');
  const [error, setError] = useState<string | null>(null);

  const EXAM_SUBJECTS: Record<string, string[]> = {
    'jee-main': ['Kinematics', 'Thermodynamics', 'Organic Chemistry — Basics', 'Calculus — Limits & Derivatives', 'Electrostatics', 'Coordinate Geometry'],
    'jee-advanced': ['Rotational Mechanics', 'Electrochemistry', 'Complex Numbers', 'Wave Optics', 'Chemical Bonding', 'Integral Calculus'],
    'neet-ug': ['Human Physiology — Digestion', 'Genetics & Evolution', 'Cell Biology', 'Plant Anatomy', 'Ecology & Environment', 'Organic Chemistry — Biomolecules'],
    'upsc-cse': ['Indian Polity — Fundamental Rights', 'Indian Economy — GDP & Growth', 'Modern History — Freedom Movement', 'Physical Geography — Landforms', 'Environment & Biodiversity', 'Ethics & Integrity'],
    'ssc-cgl': ['Reasoning — Analogies', 'Quantitative Aptitude — Percentage', 'English Grammar — Error Spotting', 'General Awareness — Indian History', 'Data Interpretation', 'Current Affairs Analysis'],
    'ssc-chsl': ['Reasoning — Series', 'Quantitative Aptitude — Profit & Loss', 'English — Sentence Improvement', 'General Awareness — Polity', 'Data Interpretation — Tables', 'Computer Knowledge'],
    'class-10-cbse': ['Light — Reflection & Refraction', 'Chemical Reactions', 'Life Processes', 'Electricity', 'Acids, Bases & Salts', 'Heredity & Evolution'],
    'class-12-cbse': ['Electrostatics', 'Ray Optics', 'Organic Chemistry', 'Probability', 'Electromagnetic Induction', 'Integration'],
  };

  const subjects = EXAM_SUBJECTS[exam] ?? ['Physics Basics', 'Chemistry Fundamentals', 'Mathematics Foundation', 'General Science', 'Logical Reasoning', 'English Comprehension'];

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`nexi.chapters.${exam}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLocalChapters(parsed);
          return; // Already have chapters, don't auto-generate
        }
      }
    } catch {}
    // No stored chapters — auto-generate first one
    generateNext(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam]);

  // Save to localStorage whenever chapters change
  useEffect(() => {
    if (chapters.length > 0) {
      try {
        localStorage.setItem(`nexi.chapters.${exam}`, JSON.stringify(chapters));
      } catch {}
    }
  }, [chapters, exam]);

  async function generateNext(index: number) {
    if (index >= subjects.length) return;
    const topic = subjects[index]!;
    setGenerating(true);
    setCurrentTopic(topic);
    setError(null);
    try {
      const res = await api.ai.generateChapter(topic);
      setLocalChapters((prev) => {
        const updated = [...prev, res.chapter];
        return updated;
      });
      // Auto-generate next (up to 3 at first visit)
      if (index < Math.min(subjects.length - 1, 2)) {
        setTimeout(() => generateNext(index + 1), 1000);
      } else {
        setGenerating(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate. Check internet connection.');
      setGenerating(false);
    }
  }

  return (
    <section className="mt-8">
      {/* Status banner */}
      <div className="paper-card p-5 border-l-4 border-l-ember-600">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          AI is building your library
        </p>
        <h2 className="font-serif mt-1 text-lg font-semibold text-ink-900">
          Personalized chapters for {exam}
        </h2>
        <p className="mt-1 text-sm text-ink-800">
          Based on your skill level, AI is generating study material. No waiting for editors.
        </p>
        {generating && (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-500">
            <span className="spinner" />
            <span>Generating: {currentTopic}...</span>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-ember-600">{error}</p>}
        {!generating && chapters.length > 0 && chapters.length < subjects.length && (
          <button
            type="button"
            onClick={() => generateNext(chapters.length)}
            className="btn-ghost-sm mt-3"
          >
            Generate more chapters ({subjects.length - chapters.length} remaining)
          </button>
        )}
      </div>

      {/* Remaining subjects to generate */}
      {chapters.length < subjects.length && !generating && (
        <div className="mt-4 flex flex-wrap gap-2">
          {subjects.slice(chapters.length).map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => generateNext(chapters.length + i)}
              className="pill hover:bg-paper-300 cursor-pointer transition text-xs"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Generated chapters */}
      {chapters.length > 0 && (
        <div className="mt-6 space-y-4">
          {chapters.map((ch, i) => (
            <ChapterCard key={i} chapter={ch} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChapterCard({ chapter, index }: { chapter: { title: string; sections: { heading: string; content: string }[]; summary: string; keyPoints: string[] }; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="paper-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-5 text-left hover:bg-paper-200/40 transition"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-500">
              Chapter {index + 1} · {chapter.sections.length} sections
            </p>
            <h3 className="font-serif mt-1 text-lg font-semibold text-ink-900">
              {chapter.title}
            </h3>
            <p className="mt-1 text-sm text-ink-800 line-clamp-2">{chapter.summary}</p>
          </div>
          <span className="shrink-0 text-muted-500 text-lg">
            {expanded ? '−' : '+'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line p-5 sm:p-8" style={{ fontFamily: 'var(--font-serif)' }}>
          {chapter.sections.map((section, i) => (
            <div key={i} className="mt-6 first:mt-0">
              <h4 className="text-base font-semibold text-ink-900">{section.heading}</h4>
              <p className="mt-2 text-sm leading-[1.8] text-ink-800 whitespace-pre-wrap">{section.content}</p>
            </div>
          ))}
          {chapter.keyPoints.length > 0 && (
            <div className="mt-6 border-t border-line pt-4">
              <h4 className="text-sm font-bold uppercase tracking-wider text-ember-600">Key Points</h4>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-800">
                {chapter.keyPoints.map((kp, i) => (
                  <li key={i} className="flex gap-2"><span className="text-ember-600">→</span> {kp}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
