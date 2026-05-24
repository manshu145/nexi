'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api, type MeResponse } from '~/lib/api';

/**
 * Admin Panel — OBSERVATION ONLY.
 * No content creation. AI handles everything.
 * Admin only monitors: analytics, users, AI logs, revenue, support.
 */
export default function AdminPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse['user'] | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'ai' | 'revenue' | 'support'>('overview');

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) api.me().then((r) => setMe(r.user)).catch(() => {});
  }, [user]);

  if (loading || !user) {
    return <main className="flex min-h-screen items-center justify-center"><span className="spinner" /></main>;
  }

  const tabs = [
    { key: 'overview' as const, label: 'Overview', icon: '📊' },
    { key: 'users' as const, label: 'Users', icon: '👥' },
    { key: 'ai' as const, label: 'AI Logs', icon: '🤖' },
    { key: 'revenue' as const, label: 'Revenue', icon: '💰' },
    { key: 'support' as const, label: 'Support', icon: '🎫' },
  ];

  return (
    <main className="min-h-screen bg-paper-100">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper-50/95 backdrop-blur-md px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="pill text-xs">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-500 hidden sm:block">{me?.email}</span>
            <button type="button" onClick={() => router.push('/dashboard')} className="btn-ghost-sm">App</button>
            <button type="button" onClick={() => signOut()} className="btn-ghost-sm">Logout</button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-line bg-paper-50 px-4 overflow-x-auto">
        <div className="mx-auto flex max-w-6xl gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-ember-600 text-ember-600'
                  : 'border-transparent text-muted-500 hover:text-ink-900'
              }`}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'ai' && <AITab />}
        {activeTab === 'revenue' && <RevenueTab />}
        {activeTab === 'support' && <SupportTab />}
      </div>
    </main>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="paper-card p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">{label}</p>
      <p className="font-serif mt-2 text-2xl font-semibold text-ink-900 sm:text-3xl">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-500">{sub}</p>}
    </div>
  );
}

function OverviewTab() {
  return (
    <div className="space-y-6">
      <h2 className="font-serif text-xl font-semibold text-ink-900">Platform Overview</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Users" value="—" sub="All time" />
        <StatCard label="Active Today" value="—" sub="DAU" />
        <StatCard label="MCQs Generated" value="—" sub="By AI today" />
        <StatCard label="Revenue (MTD)" value="₹—" sub="This month" />
      </div>
      <div className="paper-card p-5">
        <p className="text-xs font-semibold uppercase text-muted-500">Status</p>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-500" /> AI Engine: Active</div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-500" /> Auto-content: Running</div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-500" /> RSS Ingestion: Configured</div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-500" /> Payments: Active</div>
        </div>
      </div>
      <div className="paper-card p-5">
        <p className="text-xs font-semibold uppercase text-muted-500 mb-3">Note</p>
        <p className="text-sm text-ink-800">
          This is an observation-only panel. All content is generated by AI automatically.
          No manual content creation needed. The AI pipeline runs 24/7 and generates
          personalized content for each student based on their skill level.
        </p>
      </div>
    </div>
  );
}

function UsersTab() {
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-semibold text-ink-900">User Management</h2>
      <p className="text-sm text-muted-500">User data and profiles are visible here. Connect Firestore for live data.</p>
      <div className="paper-card p-5">
        <p className="text-sm text-ink-800">User listing will appear once Firestore is connected and users sign up.</p>
      </div>
    </div>
  );
}

function AITab() {
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-semibold text-ink-900">AI Usage Logs</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="OpenAI Calls" value="—" sub="Today" />
        <StatCard label="Gemini Calls" value="—" sub="Today" />
        <StatCard label="Groq Calls" value="—" sub="Today" />
      </div>
      <div className="paper-card p-5">
        <p className="text-xs font-semibold uppercase text-muted-500 mb-3">AI Pipeline Status</p>
        <div className="space-y-2 text-sm text-ink-800">
          <p>• MCQ Generation: Active (personalized per student)</p>
          <p>• Chapter Generation: Active (on-demand)</p>
          <p>• Nexipedia: Active (real-time)</p>
          <p>• Current Affairs: Auto (daily from 30 RSS sources)</p>
          <p>• Adaptive Assessment: Active</p>
          <p>• AI Chat Mentor: Active (GPT-4o-mini)</p>
        </div>
      </div>
    </div>
  );
}

function RevenueTab() {
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-semibold text-ink-900">Revenue & Payments</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Today" value="₹—" />
        <StatCard label="This Week" value="₹—" />
        <StatCard label="This Month" value="₹—" />
        <StatCard label="Total" value="₹—" />
      </div>
      <div className="paper-card p-5">
        <p className="text-sm text-ink-800">Razorpay payment data will appear after the first successful payment.</p>
      </div>
    </div>
  );
}

function SupportTab() {
  return (
    <div className="space-y-4">
      <h2 className="font-serif text-xl font-semibold text-ink-900">Support Tickets</h2>
      <p className="text-sm text-muted-500">AI handles most queries via the chat widget. Escalated issues appear here.</p>
      <div className="paper-card p-5">
        <p className="text-sm text-ink-800">No escalated tickets yet. AI is handling all student queries.</p>
      </div>
    </div>
  );
}
