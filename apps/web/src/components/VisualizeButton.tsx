'use client';

import { useState } from 'react';
import { api } from '~/lib/api';

interface Props {
  text: string;
  title?: string;
}

export function VisualizeButton({ text, title }: Props) {
  const [mermaid, setMermaid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVisualize() {
    if (mermaid) { setMermaid(null); return; } // toggle off
    setLoading(true);
    setError(null);
    try {
      const res = await api.visualize(text, title);
      setMermaid(res.mermaid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate');
    }
    setLoading(false);
  }

  return (
    <div className="my-4">
      <button
        onClick={handleVisualize}
        disabled={loading}
        className="btn-ghost-sm"
      >
        {loading ? (
          <><span className="spinner" /> Generating...</>
        ) : mermaid ? (
          'Hide visualization'
        ) : (
          <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg> Visualize</>
        )}
      </button>

      {error && <p className="mt-2 text-xs text-ember-600">{error}</p>}

      {mermaid && (
        <div className="viz-container mt-3">
          <pre className="text-xs text-ink-800 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
            {mermaid}
          </pre>
          <p className="mt-2 text-[10px] text-muted-400 italic">
            Mermaid diagram — render with any Mermaid-compatible viewer
          </p>
        </div>
      )}
    </div>
  );
}
