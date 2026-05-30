'use client';

/**
 * User store — single source of truth for the authenticated user's record.
 *
 * Why this exists (PR-32, 30 May 2026 lock from founder):
 *   "loading bahut hi jyada slow hai -- kisi bhi dusre page me jane par
 *   4 se 5 sec le raha hai itna nhi hona chiye."
 *
 * Pre-PR-32 every authenticated page (12 of them) had its own
 * `useEffect → api.me() → setState` block. Each navigation triggered
 * a fresh GET /v1/users/me round-trip (~600ms warm, 2-3s on Cloud Run
 * cold start), even though the data hadn't changed. Multiplied across
 * a typical session, that's the 4-5 second pain the founder was seeing.
 *
 * After PR-32 every page reads from this hook:
 *
 *     const { user, refresh, mutate } = useUser();
 *
 * Behaviour:
 *   - Fetches /me ONCE per Firebase auth state change.
 *   - Hydrates from sessionStorage on first render so a hard refresh
 *     paints the dashboard with cached data BEFORE the round-trip lands.
 *   - Auto-revalidates in the background:
 *       * every 5 minutes
 *       * when the tab becomes visible (window focus)
 *       * on demand via refresh()
 *   - mutate() takes a pure updater so a saveOnboarding / updateProfile
 *     call site can patch the in-memory record without waiting for the
 *     server's echo.
 *
 * Cache key strategy: the firebase uid is part of the key so a sign-out
 * + sign-in-as-different-user doesn't accidentally serve the previous
 * user's cached record. Clearing happens automatically when
 * onAuthStateChanged fires with a different uid (or null).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './auth-context';
import { api, ApiError, type StoredUser, type MeResponse } from './api';

interface DailyStreak {
  streak: number;
  creditsEarned: number;
}

interface UserContextValue {
  /** The authenticated user's persisted record. null while loading or signed-out. */
  user: StoredUser | null;
  /** Streak info from the same /me payload. */
  dailyStreak: DailyStreak | null;
  /** True until the FIRST successful fetch (or terminal error) lands. */
  loading: boolean;
  /** True during a background revalidation; UI usually ignores this. */
  refreshing: boolean;
  /** Last terminal error, if any. */
  error: Error | null;
  /** Force a refetch (used after a mutation that the server has echoed). */
  refresh: () => Promise<void>;
  /**
   * Local-only update (no network call). Use after a mutation route
   * returned the updated user, e.g.:
   *
   *     const { user: updated } = await api.updateProfile({ name });
   *     mutate((prev) => updated);
   *
   * Or for an optimistic update where the server hasn't responded yet.
   * The hook re-renders all subscribers immediately.
   */
  mutate: (updater: (prev: StoredUser | null) => StoredUser | null) => void;
}

const noop = (): UserContextValue => ({
  user: null,
  dailyStreak: null,
  loading: true,
  refreshing: false,
  error: null,
  refresh: async () => {},
  mutate: () => {},
});

const UserContext = createContext<UserContextValue>(noop());

const SS_KEY_PREFIX = 'nexi.user.v1.';
const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function ssKey(uid: string): string {
  return SS_KEY_PREFIX + uid;
}

function readCache(uid: string): MeResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ssKey(uid));
    if (!raw) return null;
    return JSON.parse(raw) as MeResponse;
  } catch {
    return null;
  }
}

function writeCache(uid: string, value: MeResponse): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ssKey(uid), JSON.stringify(value));
  } catch {
    /* sessionStorage full / disabled — non-fatal. */
  }
}

function clearAllCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(SS_KEY_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    /* best-effort */
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [dailyStreak, setDailyStreak] = useState<DailyStreak | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const lastUidRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<MeResponse> | null>(null);

  const fetchMe = useCallback(async (uid: string): Promise<void> => {
    if (inFlightRef.current) {
      try {
        await inFlightRef.current;
      } catch {
        /* surfaced by originating caller */
      }
      return;
    }
    setRefreshing(true);
    const promise = api.me().then((res) => {
      if (lastUidRef.current !== uid) return res;
      setUser(res.user);
      setDailyStreak(res.dailyStreak ?? null);
      setError(null);
      writeCache(uid, res);
      return res;
    });
    inFlightRef.current = promise;
    try {
      await promise;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      // 401/403 = stale token; auth-context will re-issue. Don't scream.
      if (!(err instanceof ApiError && (err.status === 401 || err.status === 403))) {
        setError(e);
      }
    } finally {
      inFlightRef.current = null;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const newUid = firebaseUser?.uid ?? null;
    const prevUid = lastUidRef.current;

    if (newUid !== prevUid) {
      lastUidRef.current = newUid;
      if (!newUid) {
        setUser(null);
        setDailyStreak(null);
        setError(null);
        setLoading(false);
        clearAllCaches();
        return;
      }
      const cached = readCache(newUid);
      if (cached) {
        setUser(cached.user);
        setDailyStreak(cached.dailyStreak ?? null);
        setLoading(false);
      } else {
        setLoading(true);
      }
      void fetchMe(newUid);
    }
  }, [firebaseUser, authLoading, fetchMe]);

  useEffect(() => {
    if (!firebaseUser) return;
    const id = window.setInterval(() => {
      void fetchMe(firebaseUser.uid);
    }, REVALIDATE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [firebaseUser, fetchMe]);

  useEffect(() => {
    if (!firebaseUser) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchMe(firebaseUser.uid);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [firebaseUser, fetchMe]);

  const refresh = useCallback(async (): Promise<void> => {
    if (firebaseUser) await fetchMe(firebaseUser.uid);
  }, [firebaseUser, fetchMe]);

  const mutate = useCallback((updater: (prev: StoredUser | null) => StoredUser | null): void => {
    setUser((prev) => {
      const next = updater(prev);
      if (next && firebaseUser) {
        writeCache(firebaseUser.uid, { user: next, dailyStreak: dailyStreak ?? { streak: 0, creditsEarned: 0 } });
      }
      return next;
    });
  }, [firebaseUser, dailyStreak]);

  const value = useMemo<UserContextValue>(() => ({
    user,
    dailyStreak,
    loading,
    refreshing,
    error,
    refresh,
    mutate,
  }), [user, dailyStreak, loading, refreshing, error, refresh, mutate]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

/**
 * Read the authenticated user's record from the shared store.
 * Returns the same shape on every page, so 12 pages no longer need to
 * fan out to /me independently.
 *
 * Callers that need to refetch after a mutation should EITHER:
 *   - call mutate() with the response payload (zero-network update), OR
 *   - call refresh() to force a fresh GET /me.
 */
export function useUser(): UserContextValue {
  return useContext(UserContext);
}
