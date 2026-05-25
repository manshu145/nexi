'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, GoogleAuthProvider, type User } from 'firebase/auth';
import { getFirebaseAuthClient } from './firebase';

interface AuthCtx { user: User | null; loading: boolean; signInWithGoogle: () => Promise<void>; signOut: () => Promise<void>; }
const AuthContext = createContext<AuthCtx>({ user: null, loading: true, signInWithGoogle: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const unsub = onAuthStateChanged(getFirebaseAuthClient(), (u) => { setUser(u); setLoading(false); }); return unsub; }, []);
  const signInWithGoogle = async () => { await signInWithPopup(getFirebaseAuthClient(), new GoogleAuthProvider()); };
  const signOut = async () => { await fbSignOut(getFirebaseAuthClient()); };
  return <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
