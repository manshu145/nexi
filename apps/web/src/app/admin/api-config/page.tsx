'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type ProviderConfigResponse } from '~/lib/api';
import { toast } from 'sonner';

/**
 * Admin: AI Providers (PR-29).
 *
 * Replaces the old fake "API Config" page that said "connected" for any
 * input. Each provider in the registry now gets a real card showing:
 *   - status badge (Connected / Error / Not configured)
 *   - paste-box with reveal-toggle and Save button
 *   - optional Pinned model dropdown (defaults to "Auto (use chain)")
 *   - Test Connection button that ACTUALLY calls the validate endpoint
 *   - blacklist pane (only shown if non-empty) with Clear override
 *   - Get-key + Manage-billing links to the provider's console
 *
 * Founder directive (29 May 2026): "kisi bhi model ko fix mt krna yr..
 * aisa hona chahiye ki jo model availbale ho usme auto switch ho jaye".
 * The model dropdown defaults to "Auto" -- pinning is the exception, not
 * the rule. When pinned, a small warning surfaces if the pinned model
 * has been failing (pinnedModelFailureCount > 0) so admin sees the
 * resolver is falling through.
 *
 * Brand: paper / ink / ember / muted / line tokens only. No raw amber
 * or stone -- those forked the visual language pre-PR-10.
 */
export default function AdminAIProvidersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderConfigResponse[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace('/admin/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await api.listAIProviders();
        setProviders(data.providers ?? []);
      } catch (err) {
        toast.error('Failed to load providers');
        // eslint-disable-next-line no-console
        console.error(err);
      } finally {
        setPageLoading(false);
      }
    })();
  }, [user]);

  const refresh = async () => {
    try {
      const data = await api.listAIProviders();
      setProviders(data.providers ?? []);
    } catch {
      // silent — toast already shown by caller
    }
  };

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
      <h1 className="font-serif text-2xl font-bold text-ink-900">AI Providers</h1>
      <p className="mt-1 text-sm text-muted-500">
        Save API keys, optionally pin a model, and test live connectivity. The
        runtime auto-resolver handles model fallback automatically — pinning
        is for cost / compliance overrides only.
      </p>

      <div className="mt-6 space-y-4">
        {providers.map(p => (
          <ProviderCard key={p.id} provider={p} onChange={refresh} />
        ))}
      </div>
    </div>
  );
}



interface ProviderCardProps {
  provider: ProviderConfigResponse;
  onChange: () => Promise<void>;
}

/**
 * Per-provider card. State lives here (not in the page) so editing
 * one provider doesn't re-render the others. Each card maintains its
 * own draft key and pinned-model selection until Save is clicked.
 */
function ProviderCard({ provider, onChange }: ProviderCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftKey, setDraftKey] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs: number; model?: string; sample?: string; error?: string } | null>(null);
  const [pinnedDraft, setPinnedDraft] = useState<string>(provider.pinnedModel ?? '');
  const [savingPin, setSavingPin] = useState(false);
  const [enabledDraft, setEnabledDraft] = useState(provider.enabled);
  const [showBlacklist, setShowBlacklist] = useState(false);

  // Reset draft state when provider data changes (after a refresh).
  useEffect(() => {
    setPinnedDraft(provider.pinnedModel ?? '');
    setEnabledDraft(provider.enabled);
    setEditing(false);
    setDraftKey('');
    setRevealed(false);
  }, [provider.id, provider.lastValidatedAt, provider.knownGoodAt, provider.pinnedModel, provider.enabled]);

  const handleSaveKey = async () => {
    if (!draftKey.trim()) return;
    setSavingKey(true);
    try {
      await api.updateAIProvider(provider.id, { apiKey: draftKey.trim() });
      toast.success(`${provider.label} key saved`);
      setEditing(false);
      setDraftKey('');
      await onChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(`Save failed: ${msg}`);
    } finally {
      setSavingKey(false);
    }
  };


  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await api.validateAIProvider(provider.id);
      setTestResult(data.result);
      if (data.result.ok) {
        toast.success(`${provider.label} ✓ ${data.result.latencyMs}ms (${data.result.model ?? 'unknown'})`);
      } else {
        toast.error(`${provider.label} ✗ ${data.result.error ?? 'failed'}`);
      }
      await onChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test failed';
      toast.error(`Test failed: ${msg}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSavePin = async () => {
    setSavingPin(true);
    try {
      await api.updateAIProvider(provider.id, { pinnedModel: pinnedDraft || null });
      toast.success(pinnedDraft ? `Pinned ${pinnedDraft}` : 'Cleared pin');
      await onChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(`Save failed: ${msg}`);
    } finally {
      setSavingPin(false);
    }
  };

  const handleToggleEnabled = async () => {
    const next = !enabledDraft;
    setEnabledDraft(next);
    try {
      await api.updateAIProvider(provider.id, { enabled: next });
      toast.success(next ? `${provider.label} enabled` : `${provider.label} disabled`);
      await onChange();
    } catch {
      setEnabledDraft(!next);
      toast.error('Toggle failed');
    }
  };

  const handleClearBlacklist = async () => {
    try {
      await api.clearProviderBlacklist(provider.id);
      toast.success('Blacklist cleared');
      await onChange();
    } catch {
      toast.error('Clear failed');
    }
  };


  // Status pill: Connected (validated within 24h) / Error / Not configured.
  const status: 'connected' | 'error' | 'unconfigured' = (() => {
    if (!provider.hasKey) return 'unconfigured';
    if (provider.lastValidationError) return 'error';
    if (provider.lastValidatedAt) return 'connected';
    return 'unconfigured';
  })();

  const tierBadge = provider.tier === 1 ? 'Active' : 'Future-ready';
  const formattedLastValidated = provider.lastValidatedAt
    ? new Date(provider.lastValidatedAt).toLocaleString()
    : null;

  return (
    <section className="rounded-xl border border-line bg-paper-50 p-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-lg font-semibold text-ink-900">{provider.label}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              provider.tier === 1
                ? 'bg-ember-500/10 text-ember-600'
                : 'bg-paper-200 text-muted-500'
            }`}>
              {tierBadge}
            </span>
            <StatusPill status={status} />
          </div>
          <p className="mt-1 text-xs text-muted-500">{provider.description}</p>
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
      {(formattedLastValidated || provider.lastValidationError) && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
          provider.lastValidationError
            ? 'border-red-300/40 bg-red-50/40 text-red-700'
            : 'border-line bg-paper-100 text-muted-500'
        }`}>
          {provider.lastValidationError ? (
            <>✗ Last test failed: <span className="font-mono">{provider.lastValidationError}</span></>
          ) : (
            <>
              ✓ Last validated {formattedLastValidated}
              {provider.lastValidationLatencyMs ? ` · ${provider.lastValidationLatencyMs}ms` : ''}
              {provider.knownGoodModel ? ` · model in use: ${provider.knownGoodModel}` : ''}
            </>
          )}
        </div>
      )}



      {/* API Key row */}
      <div className="mt-4">
        <label className="block text-xs font-medium text-muted-500">API Key</label>
        {editing ? (
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input
              type={revealed ? 'text' : 'password'}
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder={`Paste ${provider.label} key (starts with "${provider.keyExamplePrefix}")`}
              className="flex-1 rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 placeholder:text-muted-400 focus:border-ember-500 focus:outline-none"
              autoFocus
            />
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setRevealed(r => !r)}
                className="rounded-lg border border-line px-3 py-2 text-xs text-muted-500 hover:bg-paper-200"
                title={revealed ? 'Hide' : 'Reveal'}
                type="button"
              >
                {revealed ? 'Hide' : 'Reveal'}
              </button>
              <button
                onClick={handleSaveKey}
                disabled={savingKey || !draftKey.trim()}
                className="rounded-lg bg-ember-500 px-4 py-2 text-xs font-medium text-paper-50 hover:bg-ember-600 disabled:opacity-50"
                type="button"
              >
                {savingKey ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setDraftKey(''); setRevealed(false); }}
                disabled={savingKey}
                className="rounded-lg border border-line px-3 py-2 text-xs text-muted-500 hover:bg-paper-200"
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-mono text-sm text-ink-800">
              {provider.maskedKey || <span className="italic text-muted-400">Not configured</span>}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setEditing(true)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-800 hover:bg-paper-200"
                type="button"
              >
                {provider.hasKey ? 'Replace' : 'Add key'}
              </button>
              <button
                onClick={handleTest}
                disabled={!provider.hasKey || testing}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-800 hover:bg-paper-200 disabled:opacity-50"
                type="button"
              >
                {testing ? 'Testing…' : 'Test connection'}
              </button>
              <a
                href={provider.signupUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted-500 hover:bg-paper-200"
              >
                Get key ↗
              </a>
              <a
                href={provider.billingUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted-500 hover:bg-paper-200"
              >
                Billing ↗
              </a>
            </div>
          </div>
        )}

        {testResult && !editing && (
          <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
            testResult.ok
              ? 'border-line bg-paper-100 text-ink-800'
              : 'border-red-300/40 bg-red-50/40 text-red-700'
          }`}>
            {testResult.ok ? (
              <>
                ✓ {testResult.latencyMs}ms · model: <span className="font-mono">{testResult.model}</span>
                {testResult.sample ? <> · sample: <span className="italic">"{testResult.sample}"</span></> : null}
              </>
            ) : (
              <>✗ {testResult.error}</>
            )}
          </div>
        )}
      </div>



      {/* Pinned model row */}
      <div className="mt-4">
        <label className="block text-xs font-medium text-muted-500">
          Pinned model
          <span className="ml-2 font-normal text-muted-400">
            (optional override; leave on Auto for self-healing chain)
          </span>
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <select
            value={pinnedDraft}
            onChange={(e) => setPinnedDraft(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-paper-100 px-3 py-2 text-sm text-ink-900 focus:border-ember-500 focus:outline-none"
          >
            <option value="">Auto (use chain — recommended)</option>
            {provider.models.map(m => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.tier}
                {m.recommended ? ' · recommended' : ''}
                {m.costPer1kUsd != null ? ` · $${m.costPer1kUsd}/1k` : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleSavePin}
            disabled={savingPin || pinnedDraft === (provider.pinnedModel ?? '')}
            className="rounded-lg bg-ember-500 px-4 py-2 text-xs font-medium text-paper-50 hover:bg-ember-600 disabled:opacity-50"
            type="button"
          >
            {savingPin ? 'Saving…' : 'Save pin'}
          </button>
        </div>
        {provider.pinnedModelFailureCount > 0 && (
          <p className="mt-1.5 text-xs text-red-700">
            ⚠ Pinned model has failed {provider.pinnedModelFailureCount}/3 times.
            {provider.pinnedModelFailureCount >= 3 && ' Resolver is now bypassing the pin; clear it to silence this warning.'}
          </p>
        )}
      </div>

      {/* Blacklist drawer (only shown when non-empty) */}
      {provider.blacklist.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-paper-100 p-3">
          <button
            type="button"
            onClick={() => setShowBlacklist(s => !s)}
            className="flex w-full items-center justify-between text-xs font-medium text-ink-800"
          >
            <span>Auto-blacklisted models ({provider.blacklist.length})</span>
            <span className="text-muted-500">{showBlacklist ? '▾' : '▸'}</span>
          </button>
          {showBlacklist && (
            <div className="mt-2 space-y-1.5">
              {provider.blacklist.map(b => (
                <div key={b.model} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-paper-50 px-2 py-1.5 text-xs">
                  <div>
                    <span className="font-mono text-ink-900">{b.model}</span>
                    <span className="ml-2 text-muted-500">expires {new Date(b.until).toLocaleString()}</span>
                  </div>
                  {b.reason && <span className="max-w-md truncate text-muted-400" title={b.reason}>{b.reason}</span>}
                </div>
              ))}
              <button
                onClick={handleClearBlacklist}
                className="mt-1 rounded-lg border border-line px-3 py-1.5 text-xs text-ink-800 hover:bg-paper-200"
                type="button"
              >
                Clear blacklist (admin override)
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: 'connected' | 'error' | 'unconfigured' }) {
  if (status === 'connected') {
    return (
      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
        ● Connected
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700">
        ● Error
      </span>
    );
  }
  return (
    <span className="rounded-full bg-paper-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-500">
      ○ Not configured
    </span>
  );
}
