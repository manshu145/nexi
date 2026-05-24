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
          securityLevel: 'loose',
          flowchart: { curve: 'basis', padding: 15 },
          themeVariables: {
            primaryColor: '#F5ECD7',
            primaryBorderColor: '#D9CDB0',
            primaryTextColor: '#2A241A',
            lineColor: '#9A8E78',
            secondaryColor: '#EFE4C7',
            tertiaryColor: '#FBF6E8',
          },
        });
        // Clean up common AI-generated mermaid syntax issues
        let code = mermaidCode!.trim();
        // Remove markdown code fences if present
        code = code.replace(/^```mermaid\n?/i, '').replace(/\n?```$/i, '');
        // Fix common issues: trailing semicolons, invalid chars
        code = code.replace(/;\s*$/gm, '');

        const { svg } = await mermaid.render(`mermaid-${uid}`, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = `<div class="w-full overflow-x-auto [&>svg]:mx-auto [&>svg]:max-w-full">${svg}</div>`;
        }
      } catch (err) {
        if (!cancelled && containerRef.current) {
          // Show a friendly fallback with the raw code
          const errMsg = err instanceof Error ? err.message : 'Diagram syntax error';
          containerRef.current.innerHTML = `
            <div class="space-y-3">
              <p class="text-xs text-ember-600 font-medium">${errMsg}</p>
              <pre class="text-xs text-ink-800 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed p-3 bg-paper-200 rounded-lg border border-line">${mermaidCode}</pre>
            </div>`;
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
        <div
          className="mt-4 w-full rounded-xl border border-paper-300 bg-white p-4 sm:p-6 shadow-sm overflow-x-auto"
          style={{ minHeight: '200px', maxHeight: '600px' }}
        >
          <div ref={containerRef} className="w-full flex items-center justify-center min-h-[180px]">
            <span className="spinner" />
          </div>
          <p className="mt-3 text-[10px] text-muted-400 text-center italic">AI-generated · nexigrate</p>
        </div>
      )}
    </div>
  );
}
