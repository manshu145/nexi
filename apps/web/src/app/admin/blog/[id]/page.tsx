'use client';

/**
 * Blog post editor — closes lock §5.3 second surface.
 *
 * Full editor for a single post. Sections:
 *   - Slug + title (English) + Hindi title
 *   - Excerpt + Hindi excerpt
 *   - Body (markdown textarea) + live preview toggle
 *   - SEO: meta title, meta description, OG image URL, tags
 *   - Author name override
 *   - Status + Publish/Unpublish buttons
 *
 * Markdown → HTML preview uses a tiny safe renderer (no external dep).
 * Brand-tokened per apps/web/DESIGN.md.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, type BlogPost } from '~/lib/api';
import { useAuth } from '~/lib/auth-context';

export default function BlogEditPage() {
  const { user, loading } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [draft, setDraft] = useState<BlogPost | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHi, setShowHi] = useState(false);
  const [showSeo, setShowSeo] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/signin'); return; }
    if (!id) return;
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, id]);

  async function load() {
    if (!id) return;
    try {
      const { post } = await api.getBlogPost(id);
      setPost(post);
      setDraft(post);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load post');
      router.push('/admin/blog');
    }
  }

  if (loading || !draft) {
    return <div className="p-6 text-muted-foreground">Loading editor…</div>;
  }

  const isDirty = post && JSON.stringify(post) !== JSON.stringify(draft);

  function set<K extends keyof BlogPost>(key: K, value: BlogPost[K]) {
    setDraft(prev => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!id || !draft) return;
    setBusy(true);
    try {
      const { post: saved } = await api.updateBlogPost(id, {
        slug: draft.slug,
        title: draft.title,
        titleHi: draft.titleHi ?? '',
        excerpt: draft.excerpt,
        excerptHi: draft.excerptHi ?? '',
        body: draft.body,
        bodyHi: draft.bodyHi ?? '',
        seoTitle: draft.seoTitle ?? '',
        seoDescription: draft.seoDescription ?? '',
        ogImage: draft.ogImage ?? '',
        tags: draft.tags,
        authorName: draft.authorName,
      });
      setPost(saved);
      setDraft(saved);
      toast.success('Saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!id) return;
    if (isDirty) await save();
    setBusy(true);
    try {
      const { post: saved } = await api.publishBlogPost(id);
      setPost(saved);
      setDraft(saved);
      toast.success('Published! Visible at /blog/' + saved.slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (!id) return;
    setBusy(true);
    try {
      const { post: saved } = await api.unpublishBlogPost(id);
      setPost(saved);
      setDraft(saved);
      toast.success('Unpublished — back to draft');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unpublish failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!id) return;
    if (!confirm('Delete this post permanently? This cannot be undone.')) return;
    setBusy(true);
    try {
      await api.deleteBlogPost(id);
      toast.success('Deleted');
      router.push('/admin/blog');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button
            onClick={() => router.push('/admin/blog')}
            className="mb-1 text-xs text-muted-foreground hover:text-ink-900"
          >
            ← Back to all posts
          </button>
          <h1 className="text-2xl font-semibold text-ink-900">
            Edit: {draft.title || '(untitled)'}
          </h1>
          <p className="text-xs text-muted-foreground">
            /{draft.slug} · {draft.status}
            {isDirty && (
              <span className="ml-2 rounded-full bg-ember-500/15 px-2 py-0.5 text-ember-700">
                unsaved changes
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={save}
            disabled={busy || !isDirty}
            className="rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm font-medium text-ink-900 hover:bg-paper-200 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          {draft.status === 'published' ? (
            <button
              onClick={unpublish}
              disabled={busy}
              className="rounded-lg border border-line bg-paper-50 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-paper-100 disabled:opacity-50"
            >
              Unpublish
            </button>
          ) : (
            <button
              onClick={publish}
              disabled={busy}
              className="rounded-lg bg-ember-600 px-3 py-2 text-sm font-medium text-paper-50 hover:bg-ember-500 disabled:opacity-50"
            >
              Publish
            </button>
          )}
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-lg border border-red-300 bg-paper-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Slug">
          <input
            value={draft.slug}
            onChange={e => set('slug', e.target.value)}
            className={inputClass}
          />
          <small className="text-xs text-muted-foreground">
            URL: /blog/{draft.slug || '…'} (lowercase + hyphens only)
          </small>
        </Field>
        <Field label="Title (English)">
          <input value={draft.title} onChange={e => set('title', e.target.value)} className={inputClass} />
        </Field>
        <Field label="Excerpt (1-2 lines, used on /blog list)">
          <textarea
            value={draft.excerpt}
            onChange={e => set('excerpt', e.target.value)}
            rows={2}
            className={inputClass}
          />
        </Field>
        <Field label="Author">
          <input
            value={draft.authorName}
            onChange={e => set('authorName', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Tags (comma-separated)">
          <input
            value={draft.tags.join(', ')}
            onChange={e => set('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
            placeholder="upsc, prelims, strategy"
            className={inputClass}
          />
        </Field>
      </section>

      {/* Body editor */}
      <section className="space-y-2">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <h2 className="text-lg font-semibold text-ink-900">Body (markdown)</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setTab('edit')}
              className={
                'rounded-md px-3 py-1 text-sm ' +
                (tab === 'edit' ? 'bg-ember-500/10 text-ember-700' : 'text-muted-foreground')
              }
            >
              Edit
            </button>
            <button
              onClick={() => setTab('preview')}
              className={
                'rounded-md px-3 py-1 text-sm ' +
                (tab === 'preview' ? 'bg-ember-500/10 text-ember-700' : 'text-muted-foreground')
              }
            >
              Preview
            </button>
          </div>
        </div>
        {tab === 'edit' ? (
          <textarea
            value={draft.body}
            onChange={e => set('body', e.target.value)}
            rows={24}
            className={`${inputClass} font-mono text-sm`}
            spellCheck={false}
          />
        ) : (
          <article
            className="prose-blog rounded-lg border border-line bg-paper-50 p-6 text-ink-900"
            dangerouslySetInnerHTML={{ __html: tinyMarkdownToHtml(draft.body) }}
          />
        )}
      </section>

      {/* Hindi block (optional) */}
      <section className="space-y-2">
        <button
          onClick={() => setShowHi(s => !s)}
          className="text-sm font-medium text-ember-700 hover:text-ember-800"
        >
          {showHi ? '▾' : '▸'} Hindi version (optional)
        </button>
        {showHi && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title (Hindi)">
              <input value={draft.titleHi ?? ''} onChange={e => set('titleHi', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Excerpt (Hindi)">
              <textarea
                value={draft.excerptHi ?? ''}
                onChange={e => set('excerptHi', e.target.value)}
                rows={2}
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Body (Hindi, markdown)">
                <textarea
                  value={draft.bodyHi ?? ''}
                  onChange={e => set('bodyHi', e.target.value)}
                  rows={16}
                  className={`${inputClass} font-mono text-sm`}
                  spellCheck={false}
                  lang="hi"
                />
              </Field>
            </div>
          </div>
        )}
      </section>

      {/* SEO block */}
      <section className="space-y-2">
        <button
          onClick={() => setShowSeo(s => !s)}
          className="text-sm font-medium text-ember-700 hover:text-ember-800"
        >
          {showSeo ? '▾' : '▸'} SEO + social
        </button>
        {showSeo && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SEO title (defaults to post title)">
              <input
                value={draft.seoTitle ?? ''}
                onChange={e => set('seoTitle', e.target.value)}
                className={inputClass}
                placeholder={draft.title}
              />
            </Field>
            <Field label="OG image URL">
              <input
                value={draft.ogImage ?? ''}
                onChange={e => set('ogImage', e.target.value)}
                className={inputClass}
                placeholder="https://…"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="SEO description (160 chars max)">
                <textarea
                  value={draft.seoDescription ?? ''}
                  onChange={e => set('seoDescription', e.target.value.slice(0, 160))}
                  rows={2}
                  className={inputClass}
                  maxLength={160}
                />
                <small className="text-xs text-muted-foreground">
                  {(draft.seoDescription ?? '').length}/160
                </small>
              </Field>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const inputClass =
  'mt-1 w-full rounded-lg border border-line bg-paper-50 px-3 py-2 text-ink-900 placeholder:text-muted-foreground focus:border-ember-500 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink-900">{label}</span>
      {children}
    </label>
  );
}

/**
 * Tiny safe markdown → HTML for the editor preview only. Full marketing
 * site renders via Astro + a real markdown processor in PR-28b. This
 * one supports the structures the AI draft generator emits:
 *   ## headings, ### subheadings, **bold**, *italic*, ```code```,
 *   > blockquotes, - or * bullet lists, 1. ordered lists, paragraphs.
 * It HTML-escapes all input first so untrusted user content can't XSS.
 */
function tinyMarkdownToHtml(md: string): string {
  if (!md) return '<p class="text-muted-foreground">No content yet.</p>';
  let s = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (```lang ... ``` and ``` ... ```)
  s = s.replace(/```([a-zA-Z0-9]*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre class="overflow-x-auto rounded-md bg-paper-200 p-3 text-sm"><code>${code}</code></pre>`;
  });

  // Headings
  s = s.replace(/^### (.+)$/gm, '<h3 class="mt-5 text-lg font-semibold text-ink-900">$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2 class="mt-6 text-xl font-semibold text-ink-900">$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1 class="mt-6 text-2xl font-bold text-ink-900">$1</h1>');

  // Inline bold + italic + code
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1<em>$2</em>');
  s = s.replace(/`([^`]+)`/g, '<code class="rounded bg-paper-200 px-1 py-0.5 text-sm">$1</code>');

  // Blockquote
  s = s.replace(/^> (.+)$/gm, '<blockquote class="my-3 border-l-4 border-ember-500 pl-4 italic text-ink-700">$1</blockquote>');

  // Lists (very rough — wrap consecutive lines)
  s = s.replace(/(?:^|\n)((?:- .+\n?)+)/g, (_m, block: string) => {
    const items = block.trim().split('\n').map(l => l.replace(/^- /, '').trim());
    return '\n<ul class="my-3 list-disc space-y-1 pl-6">' + items.map(i => `<li>${i}</li>`).join('') + '</ul>\n';
  });
  s = s.replace(/(?:^|\n)((?:\d+\. .+\n?)+)/g, (_m, block: string) => {
    const items = block.trim().split('\n').map(l => l.replace(/^\d+\. /, '').trim());
    return '\n<ol class="my-3 list-decimal space-y-1 pl-6">' + items.map(i => `<li>${i}</li>`).join('') + '</ol>\n';
  });

  // Paragraphs (anything left that isn't already wrapped)
  s = s
    .split(/\n{2,}/)
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^<(h\d|ul|ol|pre|blockquote)/.test(trimmed)) return trimmed;
      return `<p class="my-3 leading-relaxed text-ink-800">${trimmed}</p>`;
    })
    .join('\n');

  return s;
}
