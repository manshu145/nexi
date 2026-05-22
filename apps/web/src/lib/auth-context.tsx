'use client';

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getFirebaseAuthClient } from './firebase';

/**
 * Auth state for the whole app.
 *
 * Wraps Firebase Auth onAuthStateChanged so any client component can read
 * the current Firebase user via `useAuth()` without prop-drilling.
 */

interface AuthState {
  user: FirebaseUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Latest ID token, refreshed on demand. Throws if not signed in. */
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuthClient();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  }, []);

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuthClient();
    await firebaseSignOut(auth);
  }, []);

  const getIdToken = useCallback(
    async (forceRefresh = false) => {
      const auth = getFirebaseAuthClient();
      const current = auth.currentUser;
      if (!current) throw new Error('not signed in');
      return current.getIdToken(forceRefresh);
    },
    [],
  );

  const value = useMemo<AuthState>(
    () => ({ user, loading, signInWithGoogle, signOut, getIdToken }),
    [user, loading, signInWithGoogle, signOut, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
