'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, GoogleAuthProvider, type User } from 'firebase/auth';
import { getFirebaseAuthClient } from './firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, signInWithGoogle: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
    return unsub;
  }, []);

  const signInWithGoogle = async () => {
    const auth = getFirebaseAuthClient();
    await signInWithPopup(auth, new GoogleAuthProvider());
  };

  const signOut = async () => {
    const auth = getFirebaseAuthClient();
    await firebaseSignOut(auth);
  };

  return <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
