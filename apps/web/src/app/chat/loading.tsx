import { Skeleton } from '~/components/Skeleton';

/**
 * Chat owns a full h-dvh column with a bottom-anchored input, so it overrides
 * the generic grid skeleton with a conversation-shaped placeholder.
 */
export default function Loading() {
  return (
    <main className="flex h-dvh flex-col px-4 pt-6 pb-4" aria-busy="true" aria-label="Loading chat">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="mt-6 flex-1 space-y-4">
        <Skeleton className="h-16 w-3/4 rounded-2xl" />
        <Skeleton className="ml-auto h-12 w-2/3 rounded-2xl" />
        <Skeleton className="h-20 w-4/5 rounded-2xl" />
        <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
    </main>
  );
}
