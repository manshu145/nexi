'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { EXAMS } from '@nexigrate/shared';
import { api } from '~/lib/api';

const CAT_LABELS: Record<string, string> = {
  'school': 'School (Class 5-12)',
  'engineering': 'Engineering',
  'medical': 'Medical',
  'civil-services': 'Civil Services & SSC',
  'banking': 'Banking',
  'defence': 'Defence',
  'teaching': 'Teaching',
  'state': 'State Exams',
  'law': 'Law',
  'management': 'Management',
  'professional-skills': 'Professional Skills',
};

// Preferred tab order; only categories actually present are shown.
const CAT_ORDER = ['school', 'engineering', 'medical', 'civil-services', 'banking', 'defence', 'teaching', 'state', 'law', 'management', 'professional-skills'];

export default function ExamPage() {
  const t = useTranslations('onboarding.exam');
  const ts = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<string>('all');

  // Tabs: only categories that have at least one exam, in preferred order.
  const presentCats = useMemo(() => {
    const set = new Set(EXAMS.map(e => e.category));
    return CAT_ORDER.filter(c => set.has(c as never));
  }, []);

  // Filter by category tab + free-text search (name / slug / category label).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXAMS.filter(ex => {
      if (activeCat !== 'all' && ex.category !== activeCat) return false;
      if (!q) return true;
      return (
        ex.name.toLowerCase().includes(q) ||
        ex.id.toLowerCase().includes(q) ||
        (CAT_LABELS[ex.category] ?? ex.category).toLowerCase().includes(q)
      );
    });
  }, [query, activeCat]);

  // Group the filtered list by category (preserve order); skip empty groups.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof EXAMS[number][]>();
    for (const ex of filtered) {
      const arr = map.get(ex.category) ?? [];
      arr.push(ex);
      map.set(ex.category, arr);
    }
    return CAT_ORDER.filter(c => map.has(c)).map(c => [c, map.get(c)!] as const);
  }, [filtered]);

  const handleSubmit = async () => {
    if (!selected) { toast.error('Please select an exam'); return; }
    setSaving(true);
    try { await api.saveOnboarding({ targetExam: selected }); router.push('/onboarding/assessment'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed'); setSaving(false); }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="pill">{ts('step', { current: 3, total: 5 })}</div>
      <div className="mt-4 flex w-full max-w-xs gap-1">{[1,2,3,4,5].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= 3 ? 'bg-ember-500' : 'bg-paper-300'}`} />)}</div>
      <h1 className="font-serif mt-8 text-center text-2xl font-semibold text-ink-900">{t('title')}</h1>
      <p className="mt-2 text-center text-sm text-muted-500">{t('subtitle')}</p>

      {/* Search */}
      <div className="mt-6 w-full">
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-400">🔍</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="परीक्षा खोजें… (e.g. UPSC, NEET, SSC, Patwari)"
            aria-label="Search exams"
            className="w-full rounded-xl border border-line bg-paper-50 py-3 pl-10 pr-4 text-sm text-ink-900 placeholder:text-muted-400 focus:outline-none focus:ring-2 focus:ring-ember-500"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="mt-3 -mx-1 flex w-full gap-1.5 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => setActiveCat('all')}
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${activeCat === 'all' ? 'bg-ember-500 text-paper-50' : 'bg-paper-200 text-muted-600 hover:bg-paper-300'}`}
        >
          All
        </button>
        {presentCats.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCat(cat)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${activeCat === cat ? 'bg-ember-500 text-paper-50' : 'bg-paper-200 text-muted-600 hover:bg-paper-300'}`}
          >
            {CAT_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="mt-6 w-full space-y-6">
        {grouped.length === 0 ? (
          <div className="paper-card p-6 text-center">
            <p className="text-2xl">🔎</p>
            <p className="mt-2 text-sm font-medium text-ink-900">No exam found for “{query}”</p>
            <p className="mt-1 text-xs text-muted-500">Try a different keyword, or browse a category above. Don&apos;t see your exam? Tell us via support.</p>
          </div>
        ) : (
          grouped.map(([cat, exams]) => (
            <div key={cat}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-500">{CAT_LABELS[cat] ?? cat}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {exams.map((ex) => (
                  <button key={ex.id} type="button" onClick={() => setSelected(ex.id)} className={`paper-card card-selectable px-3 py-3 text-left text-sm font-medium ${selected === ex.id ? 'card-selected' : ''}`}>{ex.name}</button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-8 flex w-full gap-3"><button type="button" onClick={() => router.back()} className="btn-ghost flex-1">{tc('back')}</button><button type="button" onClick={handleSubmit} disabled={!selected || saving} className="btn-primary flex-1">{saving ? tc('loading') : tc('next')}</button></div>
    </div>
  );
}
