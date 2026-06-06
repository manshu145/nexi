'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { registerPushToken, getLastPushError } from '~/lib/pushClient';
import { api } from '~/lib/api';

/**
 * Notification bell with an in-app inbox dropdown.
 *
 *   - Shows an unread-count badge.
 *   - Tapping opens a dropdown of recent notifications; tapping an item
 *     marks it read and navigates to its link.
 *   - First-time users are prompted to enable push (the old behaviour),
 *     surfaced as a banner inside the dropdown rather than hijacking the tap.
 */
interface NotificationItem {
  id: string; type: string; title: string; body: string; link?: string; isRead: boolean; createdAt: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [registering, setRegistering] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) setPermission('unsupported');
    else setPermission(Notification.permission);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.getNotifications();
      setItems(res.notifications);
      setUnread(res.unreadCount);
    } catch { /* non-critical */ }
  }, []);

  // Initial unread count + light polling (every 60s) so the badge stays fresh.
  useEffect(() => {
    void load();
    const id = window.setInterval(() => { void load(); }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) { setLoading(true); await load(); setLoading(false); }
  };

  const openItem = async (n: NotificationItem) => {
    if (!n.isRead) {
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
      setUnread(u => Math.max(0, u - 1));
      try { await api.markNotificationRead(n.id); } catch { /* ignore */ }
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  };

  const markAll = async () => {
    setItems(prev => prev.map(x => ({ ...x, isRead: true })));
    setUnread(0);
    try { await api.markAllNotificationsRead(); } catch { /* ignore */ }
  };

  const enablePush = async () => {
    if (permission === 'granted' || permission === 'unsupported') return;
    setRegistering(true);
    const success = await registerPushToken();
    if (success) { setPermission('granted'); toast.success('Notifications enabled!'); }
    else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied') {
      setPermission('denied'); toast.error('Notification permission denied. Enable it in browser settings.');
    } else {
      const reason = getLastPushError();
      toast.error(reason ? `Could not enable notifications: ${reason}` : 'Could not enable notifications.');
    }
    setRegistering(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={toggle}
        className="relative btn-ghost-sm"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="text-ink-700">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember-500 px-1 text-[10px] font-bold text-paper-50">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-line bg-paper-50 shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Notifications</p>
            {unread > 0 && <button onClick={markAll} className="text-xs text-ember-600 hover:underline">Mark all read</button>}
          </div>

          {/* Push enable banner (only when not yet granted) */}
          {permission === 'default' && (
            <button onClick={enablePush} disabled={registering} className="flex w-full items-center gap-2 border-b border-line bg-ember-500/5 px-4 py-2.5 text-left text-xs text-ink-800 hover:bg-ember-500/10">
              <span>🔔</span>
              <span className="flex-1">{registering ? 'Enabling…' : 'Enable push notifications to never miss daily current affairs'}</span>
            </button>
          )}

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-8 text-center text-xs text-muted-500">Loading…</p>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-2xl">🔕</p>
                <p className="mt-1 text-xs text-muted-500">No notifications yet</p>
              </div>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={`flex w-full items-start gap-2 border-b border-line px-4 py-3 text-left transition-colors hover:bg-paper-100 ${n.isRead ? '' : 'bg-ember-500/[0.04]'}`}
                >
                  {!n.isRead && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-ember-500" />}
                  <span className={`flex-1 ${n.isRead ? 'pl-4' : ''}`}>
                    <span className="block text-sm font-medium text-ink-900">{n.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-500">{n.body}</span>
                    <span className="mt-1 block text-[10px] text-muted-400">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
