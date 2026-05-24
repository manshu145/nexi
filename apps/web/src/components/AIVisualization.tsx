'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Phase H — AI Visualization component.
 *
 * Renders a Mermaid diagram with a "nexigrate" watermark overlay.
 * Uses dynamic import of mermaid library for client-side rendering.
 */

interface AIVisualizationProps {
  /** Mermaid diagram code to render. */
  mermaidCode: string;
  /** Caption shown below the diagram. */
  caption?: string;
}

export function AIVisualization({ mermaidCode, caption }: AIVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!mermaidCode || !containerRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        // Dynamic import — mermaid is heavy, only load when needed
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 14,
        });

        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const { svg: rendered } = await mermaid.render(id, mermaidCode);
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => { cancelled = true; };
  }, [mermaidCode]);

  if (error) {
    return (
      <div className="my-4 rounded-lg border border-line bg-paper-200 p-4 text-center">
        <p className="text-xs text-muted-500">Could not render visualization</p>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-4 flex items-center justify-center rounded-lg border border-line bg-paper-50 p-8">
        <span className="spinner" aria-hidden="true" />
        <span className="ml-2 text-xs text-muted-500">Rendering diagram…</span>
      </div>
    );
  }

  return (
    <figure className="my-6 relative overflow-hidden rounded-lg border border-line bg-paper-50 p-4">
      {/* Watermark overlay */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.07]">
        <span className="font-serif text-4xl font-bold tracking-wider text-ink-900 rotate-[-15deg] select-none">
          nexigrate
        </span>
      </div>

      {/* Diagram */}
      <div
        ref={containerRef}
        className="relative z-10 flex justify-center overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      {/* Caption */}
      {caption && (
        <figcaption className="mt-3 text-center text-xs text-muted-500 italic">
          {caption}
        </figcaption>
      )}

      {/* Branding badge */}
      <div className="absolute bottom-2 right-2 rounded-full bg-paper-200/80 px-2 py-0.5 text-[9px] font-medium text-muted-500 backdrop-blur-sm">
        AI-generated · nexigrate
      </div>
    </figure>
  );
}

/**
 * Button that triggers AI visualization generation for a given text.
 * Used in the Kindle reader on each section.
 */
interface VisualizeButtonProps {
  sectionText: string;
  sectionHeading: string;
}

export function VisualizeButton({ sectionText, sectionHeading }: VisualizeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [mermaidCode, setMermaidCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await import('~/lib/firebase').then((m) => m.getFirebaseAuthClient());
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('not signed in');

      const baseUrl = process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://localhost:9090';
      const res = await fetch(`${baseUrl}/v1/visualize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: sectionText.slice(0, 2000),
          topic: sectionHeading,
          type: 'diagram',
        }),
      });

      if (!res.ok) {
        throw new Error('Generation failed');
      }

      const data = await res.json();
      setMermaidCode(data.mermaid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [sectionText, sectionHeading]);

  return (
    <div className="mt-4">
      {!mermaidCode && !loading && (
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-50 px-3 py-1.5 text-xs font-medium text-ink-800 transition hover:bg-paper-200"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Visualize this section
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-500">
          <span className="spinner" aria-hidden="true" />
          AI is creating a diagram…
        </div>
      )}

      {error && (
        <p className="text-xs text-ember-600">{error}</p>
      )}

      {mermaidCode && (
        <AIVisualization
          mermaidCode={mermaidCode}
          caption={`AI visualization of: ${sectionHeading}`}
        />
      )}
    </div>
  );
}
