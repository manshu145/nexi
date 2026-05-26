export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <span className="text-6xl">📚</span>
      <h1 className="font-serif mt-6 text-3xl font-bold text-ink-900">Page Not Found</h1>
      <p className="mt-3 text-muted-500">The page you&apos;re looking for doesn&apos;t exist.</p>
      <a href="/dashboard" className="btn-primary mt-6">&larr; Back to Dashboard</a>
    </main>
  );
}
