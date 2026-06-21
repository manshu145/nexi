import { Skeleton } from '~/components/Skeleton';

/**
 * Current-affairs is a full-bleed vertical scroll-snap reel, so the generic
 * grid skeleton would look wrong here. Show a reel-shaped placeholder (header
 * + category pills + one tall card) during the route transition.
 */
export default function Loading() {
  return (
    <main className="flex min-h-dvh flex-col px-4 pt-6 pb-24" aria-busy="true" aria-label="Loading current affairs">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <div className="mt-4 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 flex-shrink-0 rounded-full" />
        ))}
      </div>
      <div className="mt-4 flex-1">
        <Skeleton className="h-full min-h-[60vh] w-full rounded-2xl" />
      </div>
    </main>
  );
}
