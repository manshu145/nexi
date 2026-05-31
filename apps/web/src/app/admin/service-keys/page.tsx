'use client';

/**
 * Admin: Service Keys (PR-37).
 *
 * Founder lock (30 May 2026): "Razorpay our baki jitne bhi kam ke our
 * APIs hai unko bhi dalne ka option dena admin me yr".
 *
 * Mirrors the AI Providers card pattern (PR-29) but for non-AI services
 * — Razorpay, Resend (email), WhatsApp (Meta Cloud), FCM (push). Each
 * service has its own field set declared in the backend's
 * SERVICE_DEFINITIONS, which the admin UI renders generically here.
 *
 * Design: brand tokens only (paper / ink / ember / muted / line). No
 * raw amber / stone / hex.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';
import { toast } from 'sonner';

interface FieldDef {
  id: string;
  label: string;
  placeholder?: string;
  secret: boolean;
  minLength?: number;
  helpText?: string;
}

interface FieldState {
  value?: string;
  source: 'admin' | 'env' | 'unset';
  hasValue: boolean;
}

interface ServiceConfig {
  id: string;
  label: string;
  description: string;
  tier: 'Active' | 'Future-ready';
  consoleUrl: string;
  signupUrl: string;
  enabled: boolean;
  fields: Record<string, FieldState>;
  fieldDefinitions: FieldDef[];
  lastValidatedAt: string | null;
  lastValidationError: string | null;
  updatedAt: string | null;
}

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

export default function ServiceKeysPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [services, setServices] = useState<ServiceConfig[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  const loadServices = async () => {
    try {
      const auth = getFirebaseAuthClient();
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch(`${API}/v1/admin/service-keys`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { services: ServiceConfig[] };
      setServices(data.services);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load';
      toast.error(`Could not load service keys: ${msg}`);
    } finally {
      setPageLoading(false);
    }
  };

  useEffect(() => { if (user) void loadServices(); }, [user]);

  if (loading || !user || pageLoading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-56 animate-pulse rounded bg-paper-200" />
        <div className="h-64 animate-pulse rounded-xl bg-paper-200" />
        <div className="h-64 animate-pulse rounded-xl bg-paper-200" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Service Keys</h1>
      <p className="mt-1 text-sm text-muted-500">
        Razorpay, Resend, WhatsApp, FCM. Save keys here to enable each
        service — every API call reads these at runtime so a key
        rotation takes effect within ~60 seconds, no redeploy needed.
        Environment variables in GitHub are <strong>fallback only</strong>.
      </p>

      <div className="mt-6 space-y-4">
        {services.map(s => (
          <ServiceCard key={s.id} service={s} onChange={loadServices} />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({ service, onChange }: { service: ServiceConfig; onChange: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs: number; error?: string } | null>(null);
  const [enabledDraft, setEnabledDraft] = useState(service.enabled);

  // Reset local state when the underlying service config refreshes.
  useEffect(() => {
    setEnabledDraft(service.enabled);
    setEditing(false);
    setDrafts({});
    setRevealed({});
    setTestResult(null);
  }, [service.id, service.updatedAt, service.enabled, service.lastValidationError]);

  const status: 'connected' | 'error' | 'unconfigured' = (() => {
    const hasAnyValue = Object.values(service.fields).some(f => f.hasValue);
    if (!hasAnyValue) return 'unconfigured';
    if (service.lastValidationError) return 'error';
    if (service.lastValidatedAt) return 'connected';
    return 'unconfigured';
  })();

  const auth = getFirebaseAuthClient();

  async function authedFetch(input: string, init: RequestInit = {}) {
    const token = await auth.currentUser?.getIdToken();
    return fetch(input, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authedFetch(`${API}/v1/admin/service-keys/${service.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: drafts, enabled: enabledDraft }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast.success(`${service.label} saved`);
      setTestResult(null);
      await onChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await authedFetch(`${API}/v1/admin/service-keys/${service.id}/test`, {
        method: 'POST',
      });
      const data = (await res.json()) as { result: { ok: boolean; latencyMs: number; error?: string } };
      setTestResult(data.result);
      if (data.result.ok) {
        toast.success(`${service.label} ✓ ${data.result.latencyMs}ms`);
      } else {
        toast.error(`${service.label} ✗ ${data.result.error ?? 'failed'}`);
      }
      await onChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test failed';
      toast.error(`Test failed: ${msg}`);
    } finally {
      setTesting(false);
    }
  };

  const handleToggleEnabled = async () => {
    const next = !enabledDraft;
    setEnabledDraft(next);
    try {
      await authedFetch(`${API}/v1/admin/service-keys/${service.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: next }),
      });
      toast.success(next ? `${service.label} enabled` : `${service.label} disabled`);
      await onChange();
    } catch {
      setEnabledDraft(!next);
      toast.error('Toggle failed');
    }
  };

  return (
    <section className="rounded-xl border border-line bg-paper-50 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-serif text-lg font-semibold text-ink-900">{service.label}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              service.tier === 'Active'
                ? 'bg-ember-500/10 text-ember-600'
                : 'bg-paper-200 text-muted-500'
            }`}>
              {service.tier}
            </span>
            <StatusPill status={status} />
          </div>
          <p className="mt-1 text-xs text-muted-500">{service.description}</p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-500">
          <input
            type="checkbox"
            checked={enabledDraft}
            onChange={handleToggleEnabled}
            className="h-4 w-4 rounded border-line accent-ember-500"
          />
          {enabledDraft ? 'Enabled' : 'Disabled'}
        </label>
      </div>

      {/* Validation strip */}
      {(service.lastValidatedAt || service.lastValidationError) && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
          service.lastValidationError
            ? 'border-red-300/40 bg-red-50/40 text-red-700'
            : 'border-line bg-paper-100 text-muted-500'
        }`}>
          {service.lastValidationError ? (
            <>✗ Last test failed: <span className="font-mono">{service.lastValidationError}</span></>
          ) : (
            <>✓ Last validated {new Date(service.lastValidatedAt!).toLocaleString()}</>
          )}
        </div>
      )}

      {/* Fields */}
      <div className="mt-4 space-y-3">
        {service.fieldDefinitions.map(f => {
          const state = service.fields[f.id];
          const isSecret = f.secret;
          const draftVal = drafts[f.id] ?? '';
          return (
            <div key={f.id}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="block text-xs font-medium text-muted-500">
                  {f.label}
                  {state?.source === 'env' && (
                    <span className="ml-2 rounded-full bg-paper-200 px-2 py-0.5 text-[10px] font-medium text-muted-500">env fallback</span>
                  )}
                </label>
                {f.helpText && (
                  <span className="text-[11px] text-muted-400">{f.helpText}</span>
                )}
              </div>
              {editing ? (
                <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                  <input
                    type={isSecret && !revealed[f.id] ? 'password' : 'text'}
                    value={draftVal}
                    onChange={(e) => setDrafts(prev => ({ ...prev, [f.id]: e.target.value }))}
                    placeholder={state?.value ? `Currently: ${state.value}` : f.placeholder ?? `Enter ${f.label}`}
                    className="flex-1 rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 placeholder:text-muted-400 focus:border-ember-500 focus:outline-none"
                  />
                  {isSecret && (
                    <button
                      type="button"
                      onClick={() => setRevealed(prev => ({ ...prev, [f.id]: !prev[f.id] }))}
                      className="rounded-lg border border-line px-3 py-2 text-xs text-muted-500 hover:bg-paper-200"
                    >
                      {revealed[f.id] ? 'Hide' : 'Reveal'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-paper-100 px-3 py-2">
                  <span className="font-mono text-sm text-ink-800 break-all">
                    {state?.value || (state?.hasValue ? '(env)' : <span className="italic text-muted-400">Not configured</span>)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || Object.values(drafts).every(v => v.trim().length === 0)}
              className="rounded-lg bg-ember-500 px-4 py-2 text-xs font-medium text-paper-50 hover:bg-ember-600 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setDrafts({}); setRevealed({}); }}
              disabled={saving}
              className="rounded-lg border border-line px-3 py-2 text-xs text-muted-500 hover:bg-paper-200"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-800 hover:bg-paper-200"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-800 hover:bg-paper-200 disabled:opacity-50"
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        <a
          href={service.signupUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted-500 hover:bg-paper-200"
        >
          Get key ↗
        </a>
        <a
          href={service.consoleUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted-500 hover:bg-paper-200"
        >
          Console ↗
        </a>
      </div>

      {testResult && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
          testResult.ok
            ? 'border-line bg-paper-100 text-ink-800'
            : 'border-red-300/40 bg-red-50/40 text-red-700'
        }`}>
          {testResult.ok ? (
            <>✓ {testResult.latencyMs}ms · connection successful</>
          ) : (
            <>✗ {testResult.error}</>
          )}
        </div>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: 'connected' | 'error' | 'unconfigured' }) {
  if (status === 'connected') {
    return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">● Connected</span>;
  }
  if (status === 'error') {
    return <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700">● Error</span>;
  }
  return <span className="rounded-full bg-paper-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-500">○ Not configured</span>;
}
