# Web App — Design System

This file is the contract between the web app, the marketing site, and the
admin panel. The same brand tokens drive all three surfaces. **Never use raw
Tailwind colour classes** like `amber-500`, `stone-800`, `bg-white`,
`text-gray-700` in app code — they fork the visual language and re-introduce
the multi-theme drift this project just spent a sprint cleaning up.

## Tokens

Defined as CSS custom properties in `apps/web/src/app/globals.css` and
mirrored byte-for-byte in `apps/marketing/src/styles/global.css`. Tailwind
v4 picks them up via `@theme` and exposes them as utility classes
(`bg-paper-50`, `text-ink-900`, etc.).

| Family | Use |
|---|---|
| `paper-50…400` | Surfaces — backgrounds, cards, hover fills. `paper-50` is the brightest card surface, `paper-400` is the darkest in light mode. |
| `ink-700…950` | Text and dark-on-light surfaces. `ink-900` is body text, `ink-950` is the deepest reverse surface. |
| `ember-500…700` | Accent for emphasis and CTAs. Use sparingly — `ember-500` is the default, `ember-600` is hover, `ember-700` is press. |
| `gold-500…600` | Trust accents (verified stamps, premium badges). Not a primary CTA colour. |
| `muted-400…500` | Secondary text on paper surfaces. `muted-500` is the default helper-text colour, `muted-400` is the placeholder colour. |
| `line` | Hairline borders that feel like printed paper. Use for card edges and dividers. **Never** use `border-stone-*` or `border-gray-*`. |

## Dark mode

System-based. `next-themes` is configured with `defaultTheme="system"` and
`enableSystem` in `components/providers.tsx`. The `html.dark` block in
`globals.css` redefines every token, so any class that uses a brand token
auto-adapts — no `dark:` modifier needed.

Use `dark:` modifiers only when the *layout* changes between modes (rare).
Colour swaps come for free.

## What this means in practice

- ✅ `className="bg-paper-50 text-ink-900 border border-line"`
- ✅ `className="bg-ember-500 text-paper-50 hover:bg-ember-600"`
- ❌ `className="bg-white dark:bg-stone-900"`
- ❌ `className="bg-amber-500 text-white"`
- ❌ `style={{ background: '#1C1917' }}`

## Reusable component classes

Defined in `globals.css`. Prefer these over re-implementing in JSX:

- `.paper-card` — bordered card surface with the warm paper feel
- `.btn-primary` — pill, ink-on-paper, ember on hover (the default CTA)
- `.btn-ghost` / `.btn-ghost-sm` — outlined ghost button
- `.pill` — small status chip
- `.banner` / `.banner-error` — page-level alerts
- `.input` — form input

If you find yourself copy-pasting Tailwind atoms across components, add a
class here instead.

## Manifest + favicon

`apps/web/public/manifest.json` `theme_color` must equal `#2A241A`
(`ink-900`) so the Android address bar matches the brand. The marketing
site's `<meta name="theme-color">` should match.

## When you must break the rules

Status colours that don't have brand equivalents (`text-red-600` for
errors, `text-emerald-600` for success) are allowed as a last resort. Even
then, prefer the `.banner-error` class so the styling stays in one place.
