'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';

const API_KEY_NAMES = [
  'openai',
  'groq',
  'gemini',
  'razorpay_key_id',
  'razorpay_secret',
  'resend',
  'whatsapp_token',
];

const API_KEY_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  groq: 'Groq',
  gemini: 'Gemini',
  razorpay_key_id: 'Razorpay Key ID',
  razorpay_secret: 'Razorpay Secret',
  resend: 'Resend',
  whatsapp_token: 'WhatsApp Token',
};

const MODEL_TASKS = [
  { id: 'assessment_scoring', label: 'Assessment Scoring', fixed: false },
  { id: 'chapter_content', label: 'Chapter Content', fixed: false },
  { id: 'mcq_generation', label: 'MCQ Generation', fixed: false },
  { id: 'current_affairs', label: 'Current Affairs', fixed: false },
  { id: 'chat', label: 'Chat', fixed: false },
  { id: 'diagram', label: 'Diagram', fixed: false },
  { id: 'image_gen', label: 'Image Gen', fixed: true },
  { id: 'tts', label: 'TTS', fixed: true },
];

const AVAILABLE_MODELS = [
  'GPT-4o',
  'GPT-4o-mini',
  'Groq llama-3.3-70b',
  'Gemini 2.0 Flash',
  'Gemini 2.5 Pro',
];

interface KeyInfo {
  masked: string;
  status: string;
  lastTested?: string;
}

export default function AdminApiConfigPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [keys, setKeys] = useState<Record<string, KeyInfo>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latencyMs?: number; error?: string }>>({});
  const [savingModels, setSavingModels] = useState(false);
  const [modelsSaved, setModelsSaved] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => { if (!loading && !user) router.replace('/admin/login'); }, [user, loading, router]);

  const getToken = async () => {
    const auth = getFirebaseAuthClient();
    return auth.currentUser?.getIdToken();
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/v1/admin/api-config`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as { keys: Record<string, KeyInfo>; models: Record<string, string> };
          setKeys(data.keys ?? {});
          setModels(data.models ?? {});
        }
      } catch { /* ignore */ }
      finally { setPageLoading(false); }
    })();
  }, [user]);

  const handleSaveKey = async (keyName: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/api-config/keys`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ keyName, value: editValue }),
      });
      if (res.ok) {
        setKeys(prev => ({
          ...prev,
          [keyName]: {
            masked: editValue.length > 8 ? editValue.slice(0, 4) + '••••' + editValue.slice(-4) : '••••',
            status: 'connected',
          },
        }));
        setEditingKey(null);
        setEditValue('');
      }
    } catch { /* ignore */ }
  };

  const handleTestKey = async (keyName: string) => {
    setTestingKey(keyName);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/api-config/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ keyName }),
      });
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; latencyMs?: number; error?: string };
        setTestResults(prev => ({ ...prev, [keyName]: data }));
      }
    } catch { setTestResults(prev => ({ ...prev, [keyName]: { success: false, error: 'Network error' } })); }
    finally { setTestingKey(null); }
  };

  const handleSaveModels = async () => {
    setSavingModels(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/v1/admin/api-config/models`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(models),
      });
      if (res.ok) {
        setModelsSaved(true);
        setTimeout(() => setModelsSaved(false), 3000);
      }
    } catch { /* ignore */ }
    finally { setSavingModels(false); }
  };

  const getStatusBadge = (keyName: string) => {
    const key = keys[keyName];
    if (!key || key.status === 'not_configured' || !key.masked) {
      return <span className="inline-flex items-center gap-1 text-xs text-stone-500">⚪ Not configured</span>;
    }
    if (key.status === 'error') {
      return <span className="inline-flex items-center gap-1 text-xs text-red-600">🔴 Error</span>;
    }
    return <span className="inline-flex items-center gap-1 text-xs text-amber-500">🟢 Connected</span>;
  };

  if (loading || !user || pageLoading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 rounded bg-stone-800 animate-pulse" />
        <div className="h-64 rounded bg-stone-800 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-2xl font-bold text-stone-100">🔑 API Configuration</h1>
      <p className="mt-1 text-sm text-stone-500">Manage API keys and AI model assignments</p>

      {/* API Keys Section */}
      <section className="mt-6 rounded-xl border border-stone-800 bg-stone-900 p-5">
        <h2 className="font-serif text-lg font-semibold text-stone-100">API Keys</h2>
        <p className="text-xs text-stone-500 mt-1">Configure external service credentials</p>

        <div className="mt-4 space-y-3">
          {API_KEY_NAMES.map(keyName => (
            <div key={keyName} className="flex items-center gap-3 rounded-lg border border-stone-800 bg-stone-950 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-stone-200">{API_KEY_LABELS[keyName]}</span>
                  {getStatusBadge(keyName)}
                </div>
                {editingKey === keyName ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      placeholder="Enter API key..."
                      className="flex-1 rounded-lg border border-stone-700 bg-stone-900 px-3 py-1.5 text-sm text-stone-100 placeholder-stone-600 focus:border-amber-500 focus:outline-none"
                    />
                    <button
                      onClick={() => handleSaveKey(keyName)}
                      className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-stone-900 hover:bg-amber-600 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingKey(null); setEditValue(''); }}
                      className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs text-stone-400 hover:bg-stone-800 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <p className="mt-0.5 text-xs text-stone-500 font-mono">
                    {revealedKeys.has(keyName) ? (keys[keyName]?.masked ?? '—') : (keys[keyName]?.masked ? '••••••••' : '—')}
                  </p>
                )}
              </div>

              {editingKey !== keyName && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setRevealedKeys(prev => {
                        const next = new Set(prev);
                        if (next.has(keyName)) next.delete(keyName);
                        else next.add(keyName);
                        return next;
                      });
                    }}
                    className="rounded p-1.5 text-stone-500 hover:bg-stone-800 hover:text-stone-300 transition-colors"
                    title="Reveal"
                  >
                    👁
                  </button>
                  <button
                    onClick={() => { setEditingKey(keyName); setEditValue(''); }}
                    className="rounded p-1.5 text-stone-500 hover:bg-stone-800 hover:text-stone-300 transition-colors"
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleTestKey(keyName)}
                    disabled={testingKey === keyName}
                    className="rounded p-1.5 text-stone-500 hover:bg-stone-800 hover:text-stone-300 transition-colors disabled:opacity-50"
                    title="Test"
                  >
                    {testingKey === keyName ? '⏳' : '🔍'}
                  </button>
                </div>
              )}

              {testResults[keyName] && editingKey !== keyName && (
                <span className={`text-xs ${testResults[keyName].success ? 'text-amber-500' : 'text-red-600'}`}>
                  {testResults[keyName].success ? `✓ ${testResults[keyName].latencyMs}ms` : `✗ ${testResults[keyName].error}`}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* AI Model Mapping Section */}
      <section className="mt-6 rounded-xl border border-stone-800 bg-stone-900 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-semibold text-stone-100">AI Model Mapping</h2>
            <p className="text-xs text-stone-500 mt-1">Assign AI models to each task</p>
          </div>
          <button
            onClick={handleSaveModels}
            disabled={savingModels}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {savingModels ? 'Saving...' : modelsSaved ? '✓ Saved!' : 'Save Mapping'}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-800">
                <th className="pb-2 text-left text-xs font-medium text-stone-500">Task</th>
                <th className="pb-2 text-left text-xs font-medium text-stone-500">Current Model</th>
                <th className="pb-2 text-left text-xs font-medium text-stone-500">Change</th>
              </tr>
            </thead>
            <tbody>
              {MODEL_TASKS.map(task => (
                <tr key={task.id} className="border-b border-stone-800/50">
                  <td className="py-3 text-stone-200">{task.label}</td>
                  <td className="py-3 text-stone-400 font-mono text-xs">
                    {models[task.id] || (task.fixed ? '(fixed)' : '—')}
                  </td>
                  <td className="py-3">
                    {task.fixed ? (
                      <span className="text-xs text-stone-600">Fixed</span>
                    ) : (
                      <select
                        value={models[task.id] || ''}
                        onChange={e => setModels(prev => ({ ...prev, [task.id]: e.target.value }))}
                        className="rounded-lg border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-200 focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">Select model...</option>
                        {AVAILABLE_MODELS.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
