'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  LIVE_EXAMS,
  SOON_EXAMS,
  type Chapter,
  type ChapterUpsertRequest,
} from '@nexigrate/shared';
import { api } from '~/lib/api';

/**
 * /admin/chapters/[id]
 *
 *   id = "new"      -> create form, POSTs once and routes to the saved id
 *   id = real docId -> editor seeded with the existing chapter
 *
 * Single-file editor (no rich text) -- markdown bodies in textareas. Keeps
 * the implementation small and the bundle slim. A WYSIWYG can come later
 * if authors complain.
 */
export default function AdminChapterEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const isNew = id === 'new';

  const [exam, setExam] = useState<string>(LIVE_EXAMS[0]?.id ?? 'jee-main');
  const [subject, setSubject] = useState('physics');
  const [chapterSlug, setChapterSlug] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [classLevel, setClassLevel] = useState<string>('class-11');
  const [order, setOrder] = useState<number>(1000);
  const [source, setSource] = useState('');
  const [sections, setSections] = useState<{ heading: string; body: string }[]>([
    { heading: '', body: '' },
  ]);

  const [loaded, setLoaded] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Load existing chapter when editing.
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.admin.chapters.get(id);
        if (cancelled) return;
        const ch = res.chapter;
        setLoaded(ch);
        setExam(ch.exam);
        setSubject(ch.subject);
        setChapterSlug(ch.chapterSlug);
        setTitle(ch.title);
        setSummary(ch.summary);
        setClassLevel(ch.classLevel ?? 'class-11');
        setOrder(ch.order);
        setSource(ch.source);
        setSections(
          ch.sections.length > 0
            ? ch.sections.map((s) => ({ heading: s.heading, body: s.body }))
            : [{ heading: '', body: '' }],
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'failed to load chapter');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const examChoices = useMemo(
    () => [
      ...LIVE_EXAMS.map((e) => ({ id: e.id, label: `${e.name} (live)` })),
      ...SOON_EXAMS.map((e) => ({ id: e.id, label: `${e.name} (coming soon)` })),
    ],
    [],
  );

  const buildPayload = useCallback((): ChapterUpsertRequest => {
    return {
      exam,
      subject: subject.trim(),
      chapterSlug: chapterSlug.trim(),
      title: title.trim(),
      summary: summary.trim(),
      classLevel: (classLevel || null) as ChapterUpsertRequest['classLevel'],
      sections: sections
        .map((s) => ({ heading: s.heading.trim(), body: s.body.trim() }))
        .filter((s) => s.heading.length > 0 || s.body.length > 0),
      source: source.trim(),
      order,
    };
  }, [exam, subject, chapterSlug, title, summary, classLevel, sections, source, order]);

  async function onSave() {
    setError(null);
    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (payload.sections.length === 0) {
        setError('Add at least one section before saving.');
        return;
      }
      if (isNew) {
        const res = await api.admin.chapters.create(payload);
        setToast('Chapter created as draft.');
        router.replace(`/admin/chapters/${encodeURIComponent(res.chapter.id)}`);
      } else {
        const res = await api.admin.chapters.update(id, payload);
        setLoaded(res.chapter);
        setToast('Saved.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function onPublish() {
    if (isNew || !loaded) return;
    setError(null);
    setPublishing(true);
    try {
      const res = await api.admin.chapters.publish(id);
      setLoaded(res.chapter);
      setToast('Chapter published. Students can read it now.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'publish failed');
    } finally {
      setPublishing(false);
    }
  }

  async function onArchive() {
    if (isNew || !loaded) return;
    if (!confirm('Archive this chapter? Students will no longer see it.')) return;
    setError(null);
    setArchiving(true);
    try {
      const res = await api.admin.chapters.archive(id);
      setLoaded(res.chapter);
      setToast('Chapter archived.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'archive failed');
    } finally {
      setArchiving(false);
    }
  }

  function setSection(index: number, patch: Partial<{ heading: string; body: string }>) {
    setSections((cur) =>
      cur.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }
  function addSection() {
    setSections((cur) => [...cur, { heading: '', body: '' }]);
  }
  function removeSection(index: number) {
    setSections((cur) => (cur.length === 1 ? cur : cur.filter((_, i) => i !== index)));
  }
  function moveSection(index: number, dir: -1 | 1) {
    setSections((cur) => {
      const next = [...cur];
      const j = index + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
  }

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-6">
        <span className="inline-flex items-center gap-2 text-sm text-muted-500">
          <span className="spinner" aria-hidden="true" />
          Loading chapter...
        </span>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col px-6 py-10">
      <section>
        <p className="pill mb-3">{isNew ? 'New chapter' : 'Edit chapter'}</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          {isNew ? 'Author a chapter' : title || 'Edit chapter'}
        </h1>
        {!isNew && loaded ? (
          <p className="mt-2 text-sm text-muted-500">
            <span className="font-medium text-ink-800">{loaded.status}</span> ·{' '}
            {loaded.readingTimeMinutes} min read · last updated{' '}
            {new Date(loaded.updatedAt).toLocaleString()}
          </p>
        ) : null}
      </section>

      {toast ? (
        <div className="banner banner-success mt-6" role="status">
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            className="text-xs text-muted-500 underline"
            onClick={() => setToast(null)}
          >
            dismiss
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="banner banner-error mt-6" role="alert">
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      {/* Identity (locked once created) */}
      <section className="paper-card mt-8 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          Identity
        </p>
        <h2 className="font-serif mt-1 text-xl font-semibold text-ink-900">
          Where this chapter lives
        </h2>
        {!isNew ? (
          <p className="mt-2 text-xs text-muted-500">
            Identity fields are read-only after creation. Create a new chapter
            to change exam / subject / slug.
          </p>
        ) : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="block font-medium text-ink-900">Exam</span>
            <select
              value={exam}
              onChange={(e) => setExam(e.target.value)}
              className="input mt-1 w-full"
              disabled={!isNew}
            >
              {examChoices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-ink-900">Class level</span>
            <select
              value={classLevel}
              onChange={(e) => setClassLevel(e.target.value)}
              className="input mt-1 w-full"
            >
              <option value="class-8">Class 8</option>
              <option value="class-9">Class 9</option>
              <option value="class-10">Class 10</option>
              <option value="class-11">Class 11</option>
              <option value="class-12">Class 12</option>
              <option value="graduation">Graduation</option>
              <option value="post-graduation">Post-graduation</option>
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="block font-medium text-ink-900">Subject (slug)</span>
            <input
              value={subject}
              onChange={(e) =>
                setSubject(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
              }
              placeholder="physics"
              className="input mt-1 w-full"
              disabled={!isNew}
              maxLength={40}
            />
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-ink-900">Chapter slug</span>
            <input
              value={chapterSlug}
              onChange={(e) =>
                setChapterSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
              }
              placeholder="units-and-measurements"
              className="input mt-1 w-full"
              disabled={!isNew}
              maxLength={80}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px]">
          <label className="block text-sm">
            <span className="block font-medium text-ink-900">Source citation</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="NCERT Class 11 Physics, Ch 1"
              className="input mt-1 w-full"
              maxLength={300}
            />
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-ink-900">Order</span>
            <input
              type="number"
              value={order}
              onChange={(e) => setOrder(Math.max(0, Math.min(99999, Number(e.target.value) || 0)))}
              className="input mt-1 w-full"
            />
          </label>
        </div>
      </section>

      {/* Surface */}
      <section className="paper-card mt-6 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
          Surface
        </p>
        <h2 className="font-serif mt-1 text-xl font-semibold text-ink-900">
          What students see in the chapter list
        </h2>
        <div className="mt-5 grid gap-4">
          <label className="block text-sm">
            <span className="block font-medium text-ink-900">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Units and Measurements"
              className="input mt-1 w-full"
              maxLength={200}
            />
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-ink-900">
              Summary <span className="font-normal text-muted-500">(1-2 sentences)</span>
            </span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="A grounding in the SI system, dimensional analysis, and significant figures."
              className="input mt-1 w-full"
              rows={2}
              maxLength={400}
            />
          </label>
        </div>
      </section>

      {/* Sections */}
      <section className="paper-card mt-6 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember-600">
              Body
            </p>
            <h2 className="font-serif mt-1 text-xl font-semibold text-ink-900">
              Sections ({sections.length})
            </h2>
          </div>
          <button type="button" onClick={addSection} className="btn-ghost-sm">
            + Add section
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-500">
          Each section has a heading and a markdown body. Use **bold**, *italic*,
          - bullet lists, and `inline code` -- the student view renders all of
          this safely.
        </p>
        <ol className="mt-5 space-y-4">
          {sections.map((s, i) => (
            <li
              key={i}
              className="rounded-lg border border-ink-900/10 bg-paper-100 p-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-500">
                  Section {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => moveSection(i, -1)}
                  disabled={i === 0}
                  className="btn-ghost-sm ml-auto disabled:opacity-30"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveSection(i, 1)}
                  disabled={i === sections.length - 1}
                  className="btn-ghost-sm disabled:opacity-30"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeSection(i)}
                  disabled={sections.length === 1}
                  className="btn-ghost-sm text-ember-600 disabled:opacity-30"
                  title="Remove section"
                >
                  ✕
                </button>
              </div>
              <input
                value={s.heading}
                onChange={(e) => setSection(i, { heading: e.target.value })}
                placeholder="1.1 What is a unit?"
                className="input mt-3 w-full"
                maxLength={200}
              />
              <textarea
                value={s.body}
                onChange={(e) => setSection(i, { body: e.target.value })}
                placeholder="Markdown content for this section..."
                className="input mt-2 w-full font-mono text-sm"
                rows={8}
              />
            </li>
          ))}
        </ol>
      </section>

      {/* Actions */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push('/admin/chapters')}
          className="btn-ghost"
        >
          Back to list
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {!isNew && loaded?.status !== 'archived' ? (
            <button
              type="button"
              onClick={onArchive}
              disabled={archiving}
              className="btn-ghost"
            >
              {archiving ? 'Archiving...' : 'Archive'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={submitting}
            className="btn-ghost"
          >
            {submitting ? 'Saving...' : isNew ? 'Save draft' : 'Save'}
          </button>
          {!isNew && loaded ? (
            <button
              type="button"
              onClick={onPublish}
              disabled={publishing || loaded.status === 'published'}
              className="btn-primary"
            >
              {publishing
                ? 'Publishing...'
                : loaded.status === 'published'
                  ? 'Published'
                  : 'Publish'}
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
