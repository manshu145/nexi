'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { api } from '~/lib/api';

interface Props {
  text: string;
  title?: string;
}

export function VisualizeButton({ text, title }: Props) {
  const [mermaidCode, setMermaidCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const uid = useId().replace(/:/g, '');

  async function handleVisualize() {
    if (mermaidCode) { setMermaidCode(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await api.visualize(text, title);
      setMermaidCode(res.mermaid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate');
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!mermaidCode || !containerRef.current) return;
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          fontFamily: 'Inter, system-ui, sans-serif',
          securityLevel: 'strict',
        });
        const { svg } = await mermaid.render(`mermaid-${uid}`, mermaidCode!);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = `<pre class="text-xs text-ink-800 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">${mermaidCode}</pre>`;
        }
      }
    }

    void render();
    return () => { cancelled = true; };
  }, [mermaidCode, uid]);

  return (
    <div>
      <button
        onClick={handleVisualize}
        disabled={loading}
        className="btn-ghost-sm"
      >
        {loading ? (
          <><span className="spinner" /> Generating...</>
        ) : mermaidCode ? (
          'Hide diagram'
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M17.5 14v3.5a1 1 0 0 1-1 1H14" />
            </svg>
            Visualize
          </>
        )}
      </button>

      {error && <p className="mt-2 text-xs text-ember-600">{error}</p>}

      {mermaidCode && (
        <div className="viz-container mt-3" ref={containerRef}>
          <span className="spinner" />
        </div>
      )}
    </div>
  );
}
