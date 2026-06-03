'use client';

/**
 * Admin — Previous Year Questions (PYQ) management.
 *
 * Lets the admin:
 *   - Generate / regenerate an AI-pattern paper for any exam + year.
 *   - Mark a paper as a "Verified Original" (source = admin-verified)
 *     once they've checked it against the genuine paper.
 *   - Delete a paper.
 *   - Jump to the student view to read it.
 *
 * Papers are cached + shared across all students, so generating here
 * pre-warms the cache before students hit it. Matches the stone/amber
 * surface of the sibling News Feeds admin page.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { LIVE_EXAMS, type PYQPaperSummary } from '@nexigrate/shared';

const NOW = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: NOW - 2014 }, (_, i) => NOW - i); // currentYear down to 2015

export default function AdminPYQPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [papers, setPapers] = useState<PYQPaperSummary[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  const [genExam, setGenExam] = useState<string>(LIVE_EXAMS[0]?.id ?? '');
  const [genYear, setGenYear] = useState<number>(NOW - 1);
  const [genLang, setGenLang] = useState<'en' | 'hi'>('en');
  const [genForce, setGenForce] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/admin/login'); }, [user, loading, router]);

  const fetchPapers = async () => {
    try {
      const res = await api.adminListPYQ();
      setPapers(res.papers ?? []);
    } catch { /* ignore */ }
    finally { setPageLoading(false); }
  };

  useEffect(() => { if (user) fetchPapers(); }, [user]);

  const handleGenerate = async () => {
    if (!genExam) return;
    setGenerating(true);
    setGenMsg('Generating — this can take 30–90 seconds…');
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 150_000);
    try {
      const res = await api.adminGeneratePYQ(
        { examSlug: genExam, year: genYear, language: genLang, force: genForce },
        { signal: controller.signal },
      );
      window.clearTimeout(timeoutId);
      setGenMsg(`✓ Generated ${res.paper.questions.length} questions for ${res.paper.examName} ${res.paper.year} (${res.paper.language}).`);
      setGenForce(false);
      await fetchPapers();
    } catch (err) {
      window.clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setGenMsg('Timed out after 150s — it may still be running server-side. Refresh the list in a minute.');
      } else {
        setGenMsg(err instanceof Error ? `Failed: ${err.message}` : 'Generation failed');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleVerified = async (p: PYQPaperSummary) => {
    setBusyId(p.id);
    const nextVerified = !p.verified;
    // optimistic
    setPapers(prev => prev.map(x => x.id === p.id ? { ...x, verified: nextVerified, source: nextVerified ? 'admin-verified' : 'ai-pattern' } : x));
    try {
      await api.adminUpdatePYQ(p.id, { verified: nextVerified, source: nextVerified ? 'admin-verified' : 'ai-pattern' });
    } catch {
      setPapers(prev => prev.map(x => x.id === p.id ? { ...x, verified: p.verified, source: p.source } : x));
    } finally {
      setBusyId(null);
    }
  };

  const handleRegenerate = async (p: PYQPaperSummary) => {
    setBusyId(p.id);
    try {
      await api.adminGeneratePYQ({ examSlug: p.examSlug, year: p.year, language: p.language, force: true });
      await fetchPapers();
    } catch { /* ignore */ }
    finally { setBusyId(null); }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await api.adminDeletePYQ(id);
      setPapers(prev => prev.filter(x => x.id !== id));
      setDeleteConfirm(null);
    } catch { /* ignore */ }
    finally { setBusyId(null); }
  };

  if (loading || !user || pageLoading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 rounded bg-stone-800 animate-pulse" />
        <div className="h-64 rounded bg-stone-800 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div>
        <h1 className="font-serif text-2xl font-bold text-stone-100">📄 Previous Year Questions</h1>
        <p className="mt-1 text-sm text-stone-500">Generate, verify and manage PYQ practice papers. Papers are shared + cached across all students.</p>
      </div>

      {/* Generate form */}
      <section className="mt-6 rounded-xl border border-stone-800 bg-stone-900 p-5">
        <h2 className="font-serif text-lg font-semibold text-stone-100">Generate a paper</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-stone-400">Exam</label>
            <select
              value={genExam}
              onChange={e => setGenExam(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-amber-500 focus:outline-none"
            >
              {LIVE_EXAMS.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-400">Year</label>
            <select
              value={genYear}
              onChange={e => setGenYear(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-amber-500 focus:outline-none"
            >
              {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-400">Language</label>
            <select
              value={genLang}
              onChange={e => setGenLang(e.target.value as 'en' | 'hi')}
              className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-stone-400">
            <input type="checkbox" checked={genForce} onChange={e => setGenForce(e.target.checked)} className="accent-amber-500" />
            Force regenerate if it already exists
          </label>
          <button
            onClick={handleGenerate}
            disabled={generating || !genExam}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {generating ? '⏳ Generating…' : '✨ Generate'}
          </button>
        </div>
        {genMsg && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">{genMsg}</div>
        )}
      </section>

      {/* Papers table */}
      <section className="mt-6 rounded-xl border border-stone-800 bg-stone-900 p-5">
        <h2 className="font-serif text-lg font-semibold text-stone-100">All papers ({papers.length})</h2>
        {papers.length === 0 ? (
          <div className="mt-4 text-center py-8">
            <p className="text-3xl">📄</p>
            <p className="mt-2 text-sm text-stone-500">No papers yet. Generate one above, or they&rsquo;ll be created on demand when a student opens PYQ.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="pb-2 text-left text-xs font-medium text-stone-500">Exam</th>
                  <th className="pb-2 text-center text-xs font-medium text-stone-500">Year</th>
                  <th className="pb-2 text-center text-xs font-medium text-stone-500">Lang</th>
                  <th className="pb-2 text-center text-xs font-medium text-stone-500">Qs</th>
                  <th className="pb-2 text-center text-xs font-medium text-stone-500">Status</th>
                  <th className="pb-2 text-right text-xs font-medium text-stone-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {papers.map(p => (
                  <tr key={p.id} className="border-b border-stone-800/50">
                    <td className="py-3 text-stone-200 font-medium">{p.examName}</td>
                    <td className="py-3 text-center text-stone-300">{p.year}</td>
                    <td className="py-3 text-center text-stone-400 uppercase">{p.language}</td>
                    <td className="py-3 text-center text-stone-300">{p.questionCount}</td>
                    <td className="py-3 text-center">
                      {p.verified ? (
                        <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">✓ Verified</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-stone-800 px-2 py-0.5 text-xs font-medium text-stone-400">Pattern</span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleVerified(p)}
                          disabled={busyId === p.id}
                          className="rounded px-2 py-1 text-xs font-medium bg-stone-800 text-stone-300 hover:bg-stone-700 disabled:opacity-50"
                          title={p.verified ? 'Unmark verified' : 'Mark as Verified Original'}
                        >
                          {p.verified ? 'Unverify' : 'Verify'}
                        </button>
                        <button
                          onClick={() => handleRegenerate(p)}
                          disabled={busyId === p.id}
                          className="rounded px-2 py-1 text-xs font-medium bg-stone-800 text-stone-300 hover:bg-stone-700 disabled:opacity-50"
                          title="Regenerate with AI"
                        >
                          {busyId === p.id ? '…' : '↻'}
                        </button>
                        <button
                          onClick={() => router.push(`/pyq/${encodeURIComponent(p.examSlug)}/${p.year}`)}
                          className="rounded px-2 py-1 text-xs font-medium bg-stone-800 text-stone-300 hover:bg-stone-700"
                          title="View as student"
                        >
                          👁
                        </button>
                        {deleteConfirm === p.id ? (
                          <span className="inline-flex items-center gap-1">
                            <button onClick={() => handleDelete(p.id)} className="rounded px-2 py-1 text-xs font-medium bg-red-500/15 text-red-400">Confirm</button>
                            <button onClick={() => setDeleteConfirm(null)} className="rounded px-2 py-1 text-xs font-medium bg-stone-800 text-stone-300">Cancel</button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(p.id)}
                            className="rounded p-1 text-stone-500 hover:bg-stone-800 hover:text-red-500"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
