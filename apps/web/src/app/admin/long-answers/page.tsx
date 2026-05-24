'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  EXAMS,
  LONG_ANSWER_LENGTH_HINTS,
  type ExamSlug,
  type LongAnswerLength,
  type LongAnswerQuestion,
} from '@nexigrate/shared';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /admin/long-answers -- Phase 18 admin authoring + management page.
 *
 * Long-form prompts are curated by hand (no AI generation -- founder wants
 * UPSC-quality questions). This page is a single-screen CRUD: list of
 * existing questions on the left, "create / edit" form on the right (or
 * stacked on narrow screens).
 *
 * Only `content_admin` and above can reach the underlying endpoints. We
 * do not gate the page itself; the API rejects unauthorised callers.
 */

type Mode = { kind: 'create' } | { kind: 'edit'; id: string };

const LENGTH_VALUES: LongAnswerLength[] = ['short', 'medium', 'long'];

const SUBJECT_SUGGESTIONS = [
  'general-studies',
  'history',
  'geography',
  'polity',
  'economy',
  'science-technology',
  'environment',
  'ethics',
  'essay',
  'sociology',
];

export default function AdminLongAnswersPage() {
  const { user, loading } = useAuth();

  const [questions, setQuestions] = useState<LongAnswerQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ exam: string; subject: string }>({
    exam: '',
    subject: '',
  });

  const [mode, setMode] = useState<Mode>({ kind: 'create' });
  const [form, setForm] = useState({
    slug: '',
    exam: 'upsc',
    subject: 'general-studies',
    source: '',
    prompt: '',
    expectedLength: 'medium' as LongAnswerLength,
    rubricNotes: '',
    isPublished: false,
  });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function reload() {
    try {
      const opts: Parameters<typeof api.admin.listLongAnswerQuestions>[0] = {
        limit: 200,
      };
      if (filter.exam) opts.exam = filter.exam;
      if (filter.subject) opts.subject = filter.subject;
      const res = await api.admin.listLongAnswerQuestions(opts);
      setQuestions(res.questions);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'failed to load');
    }
  }

  useEffect(() => {
    if (!user) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter.exam, filter.subject]);

  function startCreate() {
    setMode({ kind: 'create' });
    setForm({
      slug: '',
      exam: 'upsc',
      subject: 'general-studies',
      source: '',
      prompt: '',
      expectedLength: 'medium',
      rubricNotes: '',
      isPublished: false,
    });
    setFormError(null);
  }

  function startEdit(q: LongAnswerQuestion) {
    setMode({ kind: 'edit', id: q.id });
    setForm({
      slug: q.slug,
      exam: q.exam,
      subject: q.subject,
      source: q.source,
      prompt: q.prompt,
      expectedLength: q.expectedLength,
      rubricNotes: q.rubricNotes,
      isPublished: q.isPublished,
    });
    setFormError(null);
  }

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      if (mode.kind === 'create') {
        const res = await api.admin.createLongAnswerQuestion({
          slug: form.slug,
          exam: form.exam,
          subject: form.subject,
          source: form.source,
          prompt: form.prompt,
          expectedLength: form.expectedLength,
          rubricNotes: form.rubricNotes,
          isPublished: form.isPublished,
        });
        setFlash(`Created "${res.question.slug}"`);
        startCreate();
      } else {
        await api.admin.editLongAnswerQuestion(mode.id, {
          exam: form.exam,
          subject: form.subject,
          source: form.source,
          prompt: form.prompt,
          expectedLength: form.expectedLength,
          rubricNotes: form.rubricNotes,
        });
        setFlash('Saved');
      }
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(q: LongAnswerQuestion) {
    setBusy(true);
    try {
      if (q.isPublished) {
        await api.admin.unpublishLongAnswerQuestion(q.id);
      } else {
        await api.admin.publishLongAnswerQuestion(q.id);
      }
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'toggle failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(q: LongAnswerQuestion) {
    if (!window.confirm(`Delete "${q.slug}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.admin.deleteLongAnswerQuestion(q.id);
      if (mode.kind === 'edit' && mode.id === q.id) startCreate();
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setBusy(false);
    }
  }

  const sortedQuestions = useMemo(() => {
    if (!questions) return [] as LongAnswerQuestion[];
    return questions
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [questions]);

  if (loading) {
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
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 pt-8 pb-16">
      <header className="flex items-start justify-between">
        <Logo />
        <Link href="/admin" className="btn-ghost-sm">
          Admin home
        </Link>
      </header>

      <section className="mt-10">
        <p className="pill mb-3">Long-form questions</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Curate descriptive prompts.
        </h1>
        <p className="mt-2 text-ink-800">
          UPSC mains, state PSC mains, board long-answer questions.
          Authored by hand (no AI generation for the prompt itself). The
          AI grades student submissions against the rubric you set in
          model-answer notes.
        </p>
      </section>

      {flash ? (
        <div className="banner banner-success mt-4" role="status">
          {flash}
        </div>
      ) : null}
      {loadError ? (
        <div className="banner banner-error mt-4" role="alert">
          {loadError}
        </div>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1fr]">
        {/* List ----------------------------------------------------- */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-500">
              {questions ? `${questions.length} questions` : 'Loading...'}
            </h2>
            <button type="button" onClick={startCreate} className="btn-ghost-sm">
              + New
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={filter.exam}
              onChange={(e) => setFilter({ ...filter, exam: e.target.value })}
              className="input"
            >
              <option value="">All exams</option>
              {EXAMS.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={filter.subject}
              onChange={(e) => setFilter({ ...filter, subject: e.target.value })}
              placeholder="Filter by subject"
              className="input"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {sortedQuestions.map((q) => (
              <article
                key={q.id}
                className={
                  'paper-card flex items-start justify-between gap-3 p-4 transition ' +
                  (mode.kind === 'edit' && mode.id === q.id
                    ? 'card-selected'
                    : 'hover:bg-paper-200/40')
                }
              >
                <button
                  type="button"
                  onClick={() => startEdit(q)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-600">
                    {q.source}
                  </p>
                  <p className="font-serif mt-1 line-clamp-2 text-sm text-ink-900">
                    {q.prompt}
                  </p>
                  <p className="mt-1 text-xs text-muted-500">
                    {q.exam} · {q.subject} · {q.expectedLength}
                  </p>
                </button>
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => togglePublished(q)}
                    className={
                      'rounded-full px-2 py-1 text-xs font-semibold transition ' +
                      (q.isPublished
                        ? 'bg-gold-100 text-gold-700 hover:bg-gold-200'
                        : 'bg-paper-300 text-muted-500 hover:bg-paper-400')
                    }
                  >
                    {q.isPublished ? 'Published' : 'Draft'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDelete(q)}
                    className="text-xs text-ember-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
            {questions && questions.length === 0 ? (
              <p className="text-sm text-muted-500">
                No questions yet. Create the first one on the right.
              </p>
            ) : null}
          </div>
        </section>

        {/* Editor --------------------------------------------------- */}
        <section className="paper-card p-5 sm:p-6">
          <h2 className="font-serif text-xl font-semibold text-ink-900">
            {mode.kind === 'create' ? 'New question' : 'Edit question'}
          </h2>

          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
                Slug (kebab-case, unique)
              </span>
              <input
                type="text"
                value={form.slug}
                disabled={mode.kind === 'edit' || busy}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="fundamental-rights-vs-directive-principles"
                className="input mt-1 w-full"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
                  Exam
                </span>
                <select
                  value={form.exam}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, exam: e.target.value })}
                  className="input mt-1 w-full"
                >
                  {EXAMS.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
                  Subject
                </span>
                <input
                  type="text"
                  value={form.subject}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  list="la-subjects"
                  className="input mt-1 w-full"
                />
                <datalist id="la-subjects">
                  {SUBJECT_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
                Source paper (year-cited)
              </span>
              <input
                type="text"
                value={form.source}
                disabled={busy}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="UPSC Mains 2019, GS Paper II, Q9"
                className="input mt-1 w-full"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
                Prompt (shown to student)
              </span>
              <textarea
                value={form.prompt}
                disabled={busy}
                onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                rows={4}
                placeholder="Discuss the relationship between Fundamental Rights and Directive Principles of State Policy. Has the Supreme Court reconciled them?"
                className="input mt-1 w-full"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
                Expected length
              </span>
              <select
                value={form.expectedLength}
                disabled={busy}
                onChange={(e) =>
                  setForm({ ...form, expectedLength: e.target.value as LongAnswerLength })
                }
                className="input mt-1 w-full"
              >
                {LENGTH_VALUES.map((len) => (
                  <option key={len} value={len}>
                    {LONG_ANSWER_LENGTH_HINTS[len].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-500">
                Model-answer notes (HIDDEN from student; AI uses as north star)
              </span>
              <textarea
                value={form.rubricNotes}
                disabled={busy}
                onChange={(e) => setForm({ ...form, rubricNotes: e.target.value })}
                rows={6}
                placeholder="Key points the AI grader should look for: Article 13, Article 31C, Minerva Mills 1980, basic structure doctrine..."
                className="input mt-1 w-full"
              />
            </label>

            {mode.kind === 'create' ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isPublished}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                />
                <span className="text-sm text-ink-800">
                  Publish immediately (otherwise it stays a draft)
                </span>
              </label>
            ) : null}

            {formError ? (
              <div className="banner banner-error" role="alert">
                {formError}
              </div>
            ) : null}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleSave}
                className="btn-primary"
              >
                {busy ? 'Saving...' : mode.kind === 'create' ? 'Create question' : 'Save changes'}
              </button>
              {mode.kind === 'edit' ? (
                <button type="button" onClick={startCreate} className="btn-ghost">
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
