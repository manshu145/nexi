/**
 * Shared constants for the Current Affairs surfaces.
 *
 * Pre-PR-34c the category emoji + image maps lived inline in
 * `/current-affairs/page.tsx`. PR-34c added a sibling page
 * `/current-affairs/bookmarks/page.tsx` that needs the same maps to
 * render saved cards consistently. Rather than duplicate, lift them
 * into a `_shared.ts` module — the leading underscore matches the
 * Next.js convention for non-route helpers inside the app/ tree.
 *
 * No behaviour changes; just a relocation. The reels page imports from
 * here too.
 */

export const CATEGORY_EMOJIS: Record<string, string> = {
  national: '\u{1F1EE}\u{1F1F3}',
  international: '\u{1F30D}',
  economy: '\u{1F4B0}',
  'science-tech': '\u{1F52C}',
  sports: '\u{1F3CF}',
  environment: '\u{1F331}',
  politics: '\u{1F3DB}\u{FE0F}',
  defence: '\u{1F6E1}\u{FE0F}',
  all: '\u{1F4F0}',
};

export const CATEGORY_IMAGES: Record<string, string> = {
  national: 'https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=600&h=300&fit=crop&q=80',
  international: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=300&fit=crop&q=80',
  economy: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=300&fit=crop&q=80',
  'science-tech': 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=600&h=300&fit=crop&q=80',
  sports: 'https://images.unsplash.com/photo-1461896836934-bd45ea8f5a65?w=600&h=300&fit=crop&q=80',
  environment: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=300&fit=crop&q=80',
  politics: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=600&h=300&fit=crop&q=80',
  defence: 'https://images.unsplash.com/photo-1579912437766-7896df6d3cd3?w=600&h=300&fit=crop&q=80',
};
