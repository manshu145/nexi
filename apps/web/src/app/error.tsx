'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <span className="text-6xl">⚠️</span>
      <h1 className="font-serif mt-6 text-2xl font-bold text-ink-900">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted-500">An unexpected error occurred.</p>
      <button onClick={reset} className="btn-primary mt-6">Try Again</button>
    </main>
  );
}
