'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '~/lib/userStore';
import { api } from '~/lib/api';
import { toast } from 'sonner';
import { AILoader } from '~/components/ui/AILoader';

interface SavedImage {
  id: string;
  dataUrl: string;
  prompt: string;
  source: string;
  context: string;
  createdAt: string;
}

/**
 * PR-42: Image Gallery — lets users view previously generated images.
 * Founder: "user jo images generate kr raha hai vo bad me dekh ske"
 */
export default function ImageGalleryPage() {
  const router = useRouter();
  const { user: me, loading } = useUser();
  const [images, setImages] = useState<SavedImage[]>([]);
  const [fetching, setFetching] = useState(true);
  const [selected, setSelected] = useState<SavedImage | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!me) { router.replace('/signin'); return; }
    let retries = 0;
    const fetchImages = async () => {
      try {
        const res = await api.getMyImages();
        setImages(res.images);
      } catch {
        // Retry once after a short delay (handles transient network issues)
        if (retries < 1) {
          retries++;
          setTimeout(fetchImages, 1500);
          return;
        }
      }
      finally { setFetching(false); }
    };
    fetchImages();
  }, [me, loading, router]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteMyImage(id);
      setImages(prev => prev.filter(i => i.id !== id));
      setSelected(null);
      toast.success('Image deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleDownload = (img: SavedImage) => {
    const a = document.createElement('a');
    a.href = img.dataUrl;
    a.download = `nexigrate-${img.source}-${new Date(img.createdAt).toISOString().split('T')[0]}.png`;
    a.click();
  };

  if (loading || fetching) return <main className="flex min-h-dvh items-center justify-center"><AILoader context="general" /></main>;

  return (
    <main className="min-h-screen bg-paper-100 px-4 py-6 pb-24">
      <header className="mx-auto mb-6 max-w-3xl">
        <button type="button" onClick={() => router.back()} className="btn-ghost-sm mb-3">&larr; Back</button>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">My Generated Images</h1>
        <p className="mt-1 text-sm text-muted-500">All AI-generated visualizations and images you&apos;ve created.</p>
      </header>

      <section className="mx-auto max-w-3xl">
        {images.length === 0 ? (
          <div className="paper-card p-8 text-center">
            <p className="text-3xl mb-3">🎨</p>
            <p className="text-sm text-muted-500">No images yet.</p>
            <p className="text-xs text-muted-400 mt-1">Generate visualizations in Study chapters or create images in Chat — they&apos;ll appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map(img => (
              <button
                key={img.id}
                onClick={() => setSelected(img)}
                className="relative aspect-square rounded-xl overflow-hidden border border-line hover:border-ember-500/40 hover:shadow-md transition-all group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.dataUrl} alt={img.prompt} className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[10px] text-paper-50 truncate">{img.prompt || img.source}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Lightbox */}
      {selected && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-2xl bg-paper-50 dark:bg-paper-900 p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} className="absolute top-3 right-3 h-8 w-8 rounded-full bg-paper-200 flex items-center justify-center text-ink-700 hover:bg-paper-300">✕</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.dataUrl} alt={selected.prompt} className="w-full rounded-xl" />
            <div className="mt-3 space-y-1">
              {selected.prompt && <p className="text-sm text-ink-800 dark:text-ink-200">{selected.prompt}</p>}
              <p className="text-[11px] text-muted-500">
                {selected.source === 'study' ? '📖 Study visualization' : '🤖 Chat image'} &middot; {new Date(selected.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => handleDownload(selected)} className="flex-1 rounded-lg bg-ember-500 px-4 py-2 text-sm font-medium text-paper-50 hover:bg-ember-600">⬇ Download</button>
              <button onClick={() => handleDelete(selected.id)} className="rounded-lg border border-ember-500/30 px-4 py-2 text-sm font-medium text-ember-600 hover:bg-ember-500/5">🗑 Delete</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
