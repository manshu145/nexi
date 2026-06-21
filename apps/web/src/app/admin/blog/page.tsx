'use client';

/**
 * Admin Blog list — closes lock §5.3 first surface.
 *
 * Shows all posts (drafts + published + archived). Click a row to edit.
 * Filter chips up top, "+ New post" button + "AI Draft" assistant.
 * Brand-tokened (paper / ink / ember / muted) per apps/web/DESIGN.md.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, type BlogPostListItem } from '~/lib/api';
import { useAuth } from '~/lib/auth-context';

type StatusFilter = '' | 'draft' | 'published' | 'archived';

export default function AdminBlogPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPostListItem[] | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('');
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/signin'); return; }
    void load(filter);
  }, [user, loading, filter, router]);

  async function load(status: StatusFilter) {
    try {
      const opts = status ? { status } : {};
      const { posts } = await api.listBlogPosts(opts);
      setPosts(posts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load posts');
      setPosts([]);
    }
  }

  async function quickCreate() {
    setCreating(true);
    try {
      const slug = `untitled-${Date.now().toString(36)}`;
      const { post } = await api.createBlogPost({
        slug,
        title: 'Untitled draft',
        excerpt: '',
        body: '# Untitled draft\n\nStart writing here…',
      });
      router.push(`/admin/blog/${post.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create post');
    } finally {
      setCreating(false);
    }
  }

  if (loading || posts === null) {
    return <div className="p-6 text-muted-foreground">Loading blog posts…</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Blog</h1>
          <p className="text-sm text-muted-foreground">
            AI-assisted drafts, human-reviewed publishing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAiOpen(true)}
            className="rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm font-medium text-ink-900 hover:bg-paper-200"
          >
            ✨ Generate draft with AI
          </button>
          <button
            onClick={quickCreate}
            disabled={creating}
            className="rounded-lg bg-ember-600 px-3 py-2 text-sm font-medium text-paper-50 hover:bg-ember-500 disabled:opacity-50"
          >
            {creating ? 'Creating…' : '+ New post'}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-line pb-3">
        {(['', 'draft', 'published', 'archived'] as StatusFilter[]).map(s => (
          <button
            key={s || 'all'}
            onClick={() => setFilter(s)}
            className={
              'rounded-full border px-3 py-1 text-sm font-medium ' +
              (filter === s
                ? 'border-ember-500 bg-ember-500/10 text-ember-700'
                : 'border-line bg-paper-50 text-muted-foreground hover:bg-paper-100')
            }
          >
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground">
          {posts.length} post{posts.length === 1 ? '' : 's'}
        </span>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-paper-50 p-10 text-center text-muted-foreground">
          No posts yet. Click <strong className="text-ink-900">+ New post</strong> or{' '}
          <strong className="text-ink-900">Generate draft with AI</strong> to get started.
        </div>
      ) : (
        <ul className="space-y-2">
          {posts.map(p => (
            <li
              key={p.id}
              className="rounded-lg border border-line bg-paper-50 p-4 hover:bg-paper-100"
            >
              <Link href={`/admin/blog/${p.id}`} className="block">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-ink-900">
                        {p.title || '(untitled)'}
                      </h2>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                      /{p.slug}
                    </p>
                    {p.excerpt && (
                      <p className="mt-1 line-clamp-2 text-sm text-ink-700">{p.excerpt}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>Updated {new Date(p.updatedAt).toLocaleDateString()}</div>
                    {p.publishedAt && (
                      <div className="text-ember-700">
                        Published {new Date(p.publishedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {aiOpen && <AIDraftModal onClose={() => setAiOpen(false)} />}
    </div>
  );
}

function StatusBadge({ status }: { status: BlogPostListItem['status'] }) {
  const map: Record<typeof status, string> = {
    draft: 'bg-paper-200 text-ink-700 border-line',
    published: 'bg-ember-500/10 text-ember-700 border-ember-500/40',
    archived: 'bg-paper-100 text-muted-foreground border-line',
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {status}
    </span>
  );
}

function AIDraftModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [outline, setOutline] = useState('');
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [targetExam, setTargetExam] = useState('');
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (topic.trim().length < 10) {
      toast.error('Topic should be at least 10 characters');
      return;
    }
    setBusy(true);
    try {
      const draft = await api.generateBlogDraft({
        topic: topic.trim(),
        outline: outline.trim() || undefined,
        language,
        targetExam: targetExam.trim() || undefined,
      });
      // Create draft post with the generated body, then jump to editor.
      const slug = topic
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || `draft-${Date.now().toString(36)}`;
      const { post } = await api.createBlogPost({
        slug: `${slug}-${Date.now().toString(36).slice(-4)}`,
        title: topic.trim().slice(0, 120),
        excerpt: '',
        body: draft.body,
      });
      toast.success('Draft generated. Review + edit before publishing.');
      router.push(`/admin/blog/${post.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI draft failed';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-line bg-paper-50 p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-900">Generate draft with AI</h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-muted-foreground hover:text-ink-900"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="font-medium text-ink-900">Topic</span>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. UPSC Prelims 2026: Polity strategy for Class 12 students"
              className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-ink-900 placeholder:text-muted-foreground focus:border-ember-500 focus:outline-none"
              disabled={busy}
            />
          </label>
          <label className="block">
            <span className="font-medium text-ink-900">Outline (optional)</span>
            <textarea
              value={outline}
              onChange={e => setOutline(e.target.value)}
              rows={3}
              placeholder="Bullet points the AI should cover, one per line"
              className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-ink-900 placeholder:text-muted-foreground focus:border-ember-500 focus:outline-none"
              disabled={busy}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-medium text-ink-900">Language</span>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value as 'en' | 'hi')}
                className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-ink-900 focus:border-ember-500 focus:outline-none"
                disabled={busy}
              >
                <option value="en">English</option>
                <option value="hi">Hindi (Devanagari)</option>
              </select>
            </label>
            <label className="block">
              <span className="font-medium text-ink-900">Target exam (optional)</span>
              <input
                value={targetExam}
                onChange={e => setTargetExam(e.target.value)}
                placeholder="UPSC / JEE / NEET …"
                className="mt-1 w-full rounded-lg border border-line bg-paper-100 px-3 py-2 text-ink-900 placeholder:text-muted-foreground focus:border-ember-500 focus:outline-none"
                disabled={busy}
              />
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-line bg-paper-50 px-3 py-2 text-sm text-ink-900 hover:bg-paper-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={generate}
            disabled={busy}
            className="rounded-lg bg-ember-600 px-4 py-2 text-sm font-medium text-paper-50 hover:bg-ember-500 disabled:opacity-50"
          >
            {busy ? 'Generating… (10–30 s)' : 'Generate draft'}
          </button>
        </div>
      </div>
    </div>
  );
}
