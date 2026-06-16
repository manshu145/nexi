import { Skeleton } from '~/components/Skeleton';

/**
 * Universal route-transition fallback.
 *
 * Founder report (recurring): "kisi bhi section/page me navigate hone par
 * loading me bahut time le raha hai." The app had NO loading.tsx anywhere,
 * so every navigation left the PREVIOUS screen frozen during the dynamic
 * RSC round-trip — and it silently neutered prefetching, because for dynamic
 * routes Next.js only prefetches up to the nearest loading boundary (which
 * did not exist), so the BottomNav's router.prefetch() calls were no-ops.
 *
 * This boundary does two things:
 *   1. Shows an instant app-shell skeleton on EVERY navigation instead of a
 *      frozen old screen.
 *   2. Re-enables <Link>/router.prefetch — the route's loading boundary is
 *      now fetched ahead of time, so taps feel near-instant.
 *
 * Sections with a very different layout (full-bleed reel, chat) ship their
 * own loading.tsx to override this generic shell.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-5 pt-6 pb-24" aria-busy="true" aria-label="Loading">
      {/* Header (logo + actions) */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-28" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </div>

      {/* Hero */}
      <Skeleton className="mt-8 h-8 w-2/3" />
      <Skeleton className="mt-3 h-6 w-40 rounded-full" />

      {/* Strip cards */}
      <div className="mt-6 space-y-2.5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>

      {/* Feature grid */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="paper-card space-y-3 p-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </main>
  );
}
