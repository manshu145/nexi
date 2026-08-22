/**
 * Blog post storage — closes lock §5.3 (SEO + content marketing).
 *
 * The founder's lock was specific: "AI assistance chahiye, human for
 * review & all options on admin". So the blog system is built around a
 * draft → admin review/edit → publish flow:
 *
 *   1. AI generates a markdown draft (via /admin/blog/draft).
 *   2. Admin opens it in the editor, fixes whatever needs fixing.
 *   3. Admin clicks Publish, which flips status + stamps publishedAt.
 *   4. Marketing /blog pages query the public API for status='published'.
 *
 * Two stores so dev-without-Firestore stays cheap, prod runs on Firestore.
 *
 * Schema choices worth flagging:
 *   - `slug` is the public URL key (e.g. /blog/upsc-prelims-strategy-2026).
 *     We enforce uniqueness on insert/update so a typo doesn't 404 the
 *     marketing surface or, worse, shadow an existing post with new
 *     content.
 *   - `body` is markdown — admin editor renders it, marketing site
 *     converts to HTML at request time. Keeping the raw markdown lets us
 *     re-render with a different theme later without losing structure.
 *   - Hindi fields (`titleHi`, `excerptHi`, `bodyHi`) are optional. If
 *     absent the marketing site falls back to the English version. We
 *     don't auto-translate at write time — the admin can toggle a "draft
 *     in Hindi" workflow if/when needed.
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export type BlogPostStatus = 'draft' | 'published' | 'archived';

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  titleHi?: string;
  excerpt: string;
  excerptHi?: string;
  body: string;
  bodyHi?: string;
  status: BlogPostStatus;
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  tags: string[];
  authorName: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface BlogPostInput {
  slug: string;
  title: string;
  titleHi?: string;
  excerpt: string;
  excerptHi?: string;
  body: string;
  bodyHi?: string;
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  tags?: string[];
  authorName?: string;
}

export interface BlogPostUpdate {
  slug?: string;
  title?: string;
  titleHi?: string;
  excerpt?: string;
  excerptHi?: string;
  body?: string;
  bodyHi?: string;
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  tags?: string[];
  authorName?: string;
}

export interface BlogStore {
  /** Admin: list posts of any status. */
  listAll(opts?: { status?: BlogPostStatus; limit?: number }): Promise<BlogPost[]>;
  /** Public: only published posts, newest first. */
  listPublished(opts?: { limit?: number; tag?: string }): Promise<BlogPost[]>;
  getById(id: string): Promise<BlogPost | null>;
  /** Public marketing route looks up by slug. */
  getBySlug(slug: string): Promise<BlogPost | null>;
  create(input: BlogPostInput): Promise<BlogPost>;
  update(id: string, patch: BlogPostUpdate): Promise<BlogPost | null>;
  publish(id: string): Promise<BlogPost | null>;
  unpublish(id: string): Promise<BlogPost | null>;
  remove(id: string): Promise<boolean>;
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Slugs must be URL-safe, lowercase, and unique. We don't auto-rewrite the
 * caller's slug -- only validate -- because rewriting would surprise the
 * admin who just typed "UPSC-Strategy" expecting that exact slug to work.
 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function validateSlug(slug: string): string | null {
  if (!slug) return 'slug is required';
  if (slug.length > 80) return 'slug must be 80 characters or fewer';
  if (!SLUG_RE.test(slug)) {
    return 'slug must be lowercase letters, digits, and hyphens (e.g. upsc-strategy-2026)';
  }
  return null;
}

/** In-memory store for dev / tests. */
export class InMemoryBlogStore implements BlogStore {
  private posts = new Map<string, BlogPost>();

  async listAll(opts?: { status?: BlogPostStatus; limit?: number }): Promise<BlogPost[]> {
    let rows = [...this.posts.values()];
    if (opts?.status) rows = rows.filter(p => p.status === opts.status);
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (opts?.limit) rows = rows.slice(0, opts.limit);
    return rows;
  }

  async listPublished(opts?: { limit?: number; tag?: string }): Promise<BlogPost[]> {
    let rows = [...this.posts.values()].filter(p => p.status === 'published');
    if (opts?.tag) rows = rows.filter(p => p.tags.includes(opts.tag!));
    rows.sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt));
    if (opts?.limit) rows = rows.slice(0, opts.limit);
    return rows;
  }

  async getById(id: string): Promise<BlogPost | null> { return this.posts.get(id) ?? null; }

  async getBySlug(slug: string): Promise<BlogPost | null> {
    for (const p of this.posts.values()) if (p.slug === slug) return p;
    return null;
  }

  async create(input: BlogPostInput): Promise<BlogPost> {
    const err = validateSlug(input.slug);
    if (err) throw new Error(err);
    if (await this.getBySlug(input.slug)) {
      throw new Error(`slug "${input.slug}" already exists`);
    }
    const ts = nowIso();
    const post: BlogPost = {
      id: crypto.randomUUID(),
      slug: input.slug,
      title: input.title,
      titleHi: input.titleHi,
      excerpt: input.excerpt,
      excerptHi: input.excerptHi,
      body: input.body,
      bodyHi: input.bodyHi,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      ogImage: input.ogImage,
      tags: input.tags ?? [],
      authorName: input.authorName ?? 'Nexigrate',
      status: 'draft',
      createdAt: ts,
      updatedAt: ts,
    };
    this.posts.set(post.id, post);
    return post;
  }

  async update(id: string, patch: BlogPostUpdate): Promise<BlogPost | null> {
    const cur = this.posts.get(id);
    if (!cur) return null;
    if (patch.slug && patch.slug !== cur.slug) {
      const err = validateSlug(patch.slug);
      if (err) throw new Error(err);
      const dupe = await this.getBySlug(patch.slug);
      if (dupe && dupe.id !== id) throw new Error(`slug "${patch.slug}" already exists`);
    }
    const next: BlogPost = { ...cur, ...patch, id: cur.id, updatedAt: nowIso() };
    this.posts.set(id, next);
    return next;
  }

  async publish(id: string): Promise<BlogPost | null> {
    const cur = this.posts.get(id);
    if (!cur) return null;
    const ts = nowIso();
    const next: BlogPost = {
      ...cur,
      status: 'published',
      publishedAt: cur.publishedAt ?? ts,
      updatedAt: ts,
    };
    this.posts.set(id, next);
    return next;
  }

  async unpublish(id: string): Promise<BlogPost | null> {
    const cur = this.posts.get(id);
    if (!cur) return null;
    const next: BlogPost = { ...cur, status: 'draft', updatedAt: nowIso() };
    this.posts.set(id, next);
    return next;
  }

  async remove(id: string): Promise<boolean> { return this.posts.delete(id); }
}

/** Firestore-backed store. Single collection, indexed on slug + status. */
export class FirestoreBlogStore implements BlogStore {
  constructor(private fs: Firestore) {}

  private col() { return this.fs.collection('blogPosts'); }

  private map(doc: FirebaseFirestore.DocumentSnapshot): BlogPost | null {
    if (!doc.exists) return null;
    const d = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      slug: String(d['slug'] ?? ''),
      title: String(d['title'] ?? ''),
      titleHi: d['titleHi'] as string | undefined,
      excerpt: String(d['excerpt'] ?? ''),
      excerptHi: d['excerptHi'] as string | undefined,
      body: String(d['body'] ?? ''),
      bodyHi: d['bodyHi'] as string | undefined,
      status: ((d['status'] as string) ?? 'draft') as BlogPostStatus,
      seoTitle: d['seoTitle'] as string | undefined,
      seoDescription: d['seoDescription'] as string | undefined,
      ogImage: d['ogImage'] as string | undefined,
      tags: Array.isArray(d['tags']) ? (d['tags'] as string[]) : [],
      authorName: String(d['authorName'] ?? 'Nexigrate'),
      createdAt: String(d['createdAt'] ?? ''),
      updatedAt: String(d['updatedAt'] ?? ''),
      publishedAt: d['publishedAt'] as string | undefined,
    };
  }

  async listAll(opts?: { status?: BlogPostStatus; limit?: number }): Promise<BlogPost[]> {
    let q: FirebaseFirestore.Query = this.col();
    if (opts?.status) q = q.where('status', '==', opts.status);
    // Sort in memory to avoid composite-index pitfalls (PR-03 #182 lesson).
    const snap = await q.limit(opts?.limit ?? 100).get();
    const rows = snap.docs.map(d => this.map(d)!).filter(Boolean);
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return rows;
  }

  async listPublished(opts?: { limit?: number; tag?: string }): Promise<BlogPost[]> {
    let q: FirebaseFirestore.Query = this.col().where('status', '==', 'published');
    // Tag filtering requires an array-contains; safe with single-field index.
    if (opts?.tag) q = q.where('tags', 'array-contains', opts.tag);
    const snap = await q.limit(opts?.limit ?? 50).get();
    const rows = snap.docs.map(d => this.map(d)!).filter(Boolean);
    rows.sort((a, b) =>
      (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt),
    );
    return rows;
  }

  async getById(id: string): Promise<BlogPost | null> {
    return this.map(await this.col().doc(id).get());
  }

  async getBySlug(slug: string): Promise<BlogPost | null> {
    const snap = await this.col().where('slug', '==', slug).limit(1).get();
    if (snap.empty) return null;
    return this.map(snap.docs[0]!);
  }

  async create(input: BlogPostInput): Promise<BlogPost> {
    const err = validateSlug(input.slug);
    if (err) throw new Error(err);
    if (await this.getBySlug(input.slug)) {
      throw new Error(`slug "${input.slug}" already exists`);
    }
    const ts = nowIso();
    const id = crypto.randomUUID();
    const doc: Record<string, unknown> = {
      slug: input.slug,
      title: input.title,
      titleHi: input.titleHi ?? FieldValue.delete(),
      excerpt: input.excerpt,
      excerptHi: input.excerptHi ?? FieldValue.delete(),
      body: input.body,
      bodyHi: input.bodyHi ?? FieldValue.delete(),
      seoTitle: input.seoTitle ?? FieldValue.delete(),
      seoDescription: input.seoDescription ?? FieldValue.delete(),
      ogImage: input.ogImage ?? FieldValue.delete(),
      tags: input.tags ?? [],
      authorName: input.authorName ?? 'Nexigrate',
      status: 'draft',
      createdAt: ts,
      updatedAt: ts,
    };
    // Firestore rejects FieldValue.delete() on a fresh create -- strip those.
    for (const k of Object.keys(doc)) {
      if (doc[k] === FieldValue.delete()) delete doc[k];
    }
    await this.col().doc(id).set(doc);
    return (await this.getById(id))!;
  }

  async update(id: string, patch: BlogPostUpdate): Promise<BlogPost | null> {
    const cur = await this.getById(id);
    if (!cur) return null;
    if (patch.slug && patch.slug !== cur.slug) {
      const err = validateSlug(patch.slug);
      if (err) throw new Error(err);
      const dupe = await this.getBySlug(patch.slug);
      if (dupe && dupe.id !== id) throw new Error(`slug "${patch.slug}" already exists`);
    }
    const updateDoc: Record<string, unknown> = { updatedAt: nowIso() };
    for (const k of Object.keys(patch) as (keyof BlogPostUpdate)[]) {
      const val = patch[k];
      if (val === undefined) continue;
      // Empty string on optional Hindi/SEO fields means "clear it".
      if (val === '' && (k === 'titleHi' || k === 'excerptHi' || k === 'bodyHi' ||
                          k === 'seoTitle' || k === 'seoDescription' || k === 'ogImage')) {
        updateDoc[k] = FieldValue.delete();
      } else {
        updateDoc[k] = val;
      }
    }
    await this.col().doc(id).update(updateDoc);
    return this.getById(id);
  }

  async publish(id: string): Promise<BlogPost | null> {
    const cur = await this.getById(id);
    if (!cur) return null;
    const ts = nowIso();
    const update: Record<string, unknown> = {
      status: 'published',
      updatedAt: ts,
    };
    if (!cur.publishedAt) update['publishedAt'] = ts;
    await this.col().doc(id).update(update);
    return this.getById(id);
  }

  async unpublish(id: string): Promise<BlogPost | null> {
    const cur = await this.getById(id);
    if (!cur) return null;
    await this.col().doc(id).update({ status: 'draft', updatedAt: nowIso() });
    return this.getById(id);
  }

  async remove(id: string): Promise<boolean> {
    const cur = await this.col().doc(id).get();
    if (!cur.exists) return false;
    await this.col().doc(id).delete();
    return true;
  }
}
