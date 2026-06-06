'use client';

/**
 * Admin — Exam Dates management.
 *
 * Lets an admin pick any exam from the catalog and edit its calendar
 * events (Prelims/Mains/registration windows…). Each event has an exact
 * date OR an estimate + "confirmed?" flag. Saved to examDates/{slug}.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { EXAMS } from '@nexigrate/shared';
import { api, type ExamDates, type ExamEvent } from '~/lib/api';

const emptyEvent = (): ExamEvent => ({
  name: '', date: null, estimatedMonth: '', isConfirmed: false, sourceUrl: '', registrationStart: null, registrationEnd: null,
});

export default function AdminExamDatesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [all, setAll] = useState<Record<string, ExamDates>>({});
  const [pageLoading, setPageLoading] = useState(true);
  const [selected, setSelected] = useState<string>(EXAMS[0]?.id ?? '');
  const [events, setEvents] = useState<ExamEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await api.getExamDates();
        const map: Record<string, ExamDates> = {};
        for (const e of res.exams) map[e.examSlug] = e;
        setAll(map);
      } catch { /* ignore */ } finally { setPageLoading(false); }
    })();
  }, [user]);

  const examName = useMemo(() => EXAMS.find(e => e.id === selected)?.name ?? selected, [selected]);

  // Load events for the selected exam whenever it changes.
  useEffect(() => {
    const existing = all[selected];
    setEvents(existing ? existing.events.map(e => ({ ...e })) : []);
    setMsg(null);
  }, [selected, all]);

  const updateEvent = (i: number, patch: Partial<ExamEvent>) => {
    setEvents(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const cleaned = events.filter(e => e.name.trim());
      const saved = await api.updateExamDates(selected, examName, cleaned);
      setAll(prev => ({ ...prev, [selected]: saved }));
      setMsg('Saved ✓');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Save failed');
    } finally { setSaving(false); }
  };

  if (loading || pageLoading) return <div className="p-6 text-sm text-muted-500">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">Exam Dates</h1>
      <p className="mt-1 text-sm text-muted-500">Manage exam calendars. Set exact dates and mark them confirmed when official notifications are published.</p>

      {/* Exam picker */}
      <div className="mt-5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-500">Exam</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line bg-paper-50 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-ember-500"
        >
          {EXAMS.map(ex => (
            <option key={ex.id} value={ex.id}>{ex.name}{all[ex.id] ? ' • has dates' : ''}</option>
          ))}
        </select>
      </div>

      {/* Events editor */}
      <div className="mt-6 space-y-4">
        {events.length === 0 && <p className="text-sm text-muted-500">No events yet. Add one below.</p>}
        {events.map((evt, i) => (
          <div key={i} className="paper-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-500">Event {i + 1}</p>
              <button type="button" onClick={() => setEvents(prev => prev.filter((_, idx) => idx !== i))} className="text-xs text-red-600 hover:underline">Remove</button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted-600">Event name
                <input value={evt.name} onChange={e => updateEvent(i, { name: e.target.value })} placeholder="Prelims 2027" className="mt-1 w-full rounded-lg border border-line bg-paper-50 px-3 py-2 text-sm text-ink-900" />
              </label>
              <label className="text-xs text-muted-600">Exact date (if confirmed)
                <input type="date" value={evt.date ?? ''} onChange={e => updateEvent(i, { date: e.target.value || null })} className="mt-1 w-full rounded-lg border border-line bg-paper-50 px-3 py-2 text-sm text-ink-900" />
              </label>
              <label className="text-xs text-muted-600">Estimated month (if unconfirmed)
                <input value={evt.estimatedMonth} onChange={e => updateEvent(i, { estimatedMonth: e.target.value })} placeholder="May 2027" className="mt-1 w-full rounded-lg border border-line bg-paper-50 px-3 py-2 text-sm text-ink-900" />
              </label>
              <label className="text-xs text-muted-600">Official source URL
                <input value={evt.sourceUrl} onChange={e => updateEvent(i, { sourceUrl: e.target.value })} placeholder="https://upsc.gov.in" className="mt-1 w-full rounded-lg border border-line bg-paper-50 px-3 py-2 text-sm text-ink-900" />
              </label>
              <label className="text-xs text-muted-600">Registration start
                <input type="date" value={evt.registrationStart ?? ''} onChange={e => updateEvent(i, { registrationStart: e.target.value || null })} className="mt-1 w-full rounded-lg border border-line bg-paper-50 px-3 py-2 text-sm text-ink-900" />
              </label>
              <label className="text-xs text-muted-600">Registration end
                <input type="date" value={evt.registrationEnd ?? ''} onChange={e => updateEvent(i, { registrationEnd: e.target.value || null })} className="mt-1 w-full rounded-lg border border-line bg-paper-50 px-3 py-2 text-sm text-ink-900" />
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink-800">
              <input type="checkbox" checked={evt.isConfirmed} onChange={e => updateEvent(i, { isConfirmed: e.target.checked })} />
              Date is officially confirmed
            </label>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setEvents(prev => [...prev, emptyEvent()])} className="btn-ghost">+ Add event</button>
        <button type="button" onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save dates'}</button>
        {msg && <span className="text-sm text-muted-600">{msg}</span>}
      </div>
    </div>
  );
}
