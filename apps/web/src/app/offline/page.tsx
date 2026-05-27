export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center bg-amber-50/30 dark:bg-slate-950">
      <span className="font-serif text-3xl font-bold text-amber-500">Nexigrate</span>
      <div className="mt-8">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-slate-400">
          <path d="M1 1l22 22" strokeLinecap="round"/>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>
      </div>
      <h1 className="mt-6 text-xl font-bold text-slate-900 dark:text-slate-100">
        You&apos;re offline
      </h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-sm">
        Some content may not be available without an internet connection. Please check your connection and try again.
      </p>
      <a
        href="/dashboard"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 transition-colors"
      >
        Go to Dashboard
      </a>
    </main>
  );
}
