'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  PhoneAuthProvider,
  linkWithCredential,
  RecaptchaVerifier,
  type User,
  type ConfirmationResult,
} from 'firebase/auth';
import { getFirebaseAuthClient } from './firebase';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<User>;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  sendPhoneOtp: (phoneNumber: string, recaptchaContainerId: string) => Promise<ConfirmationResult>;
  signInWithPhone: (phoneNumber: string, recaptchaContainerId: string) => Promise<ConfirmationResult>;
  verifyPhoneOtp: (confirmationResult: ConfirmationResult, code: string) => Promise<void>;
  linkPhoneToAccount: (verificationId: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  signUpWithEmail: async () => { throw new Error('Not initialized'); },
  signInWithEmail: async () => { throw new Error('Not initialized'); },
  sendPhoneOtp: async () => { throw new Error('Not initialized'); },
  signInWithPhone: async () => { throw new Error('Not initialized'); },
  verifyPhoneOtp: async () => {},
  linkPhoneToAccount: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuthClient(), (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInWithGoogle = async () => {
    await signInWithPopup(getFirebaseAuthClient(), new GoogleAuthProvider());
  };

  const signUpWithEmail = async (email: string, password: string): Promise<User> => {
    const cred = await createUserWithEmailAndPassword(getFirebaseAuthClient(), email, password);
    return cred.user;
  };

  const signInWithEmail = async (email: string, password: string): Promise<User> => {
    const cred = await signInWithEmailAndPassword(getFirebaseAuthClient(), email, password);
    return cred.user;
  };

  const sendPhoneOtp = async (phoneNumber: string, recaptchaContainerId: string): Promise<ConfirmationResult> => {
    const auth = getFirebaseAuthClient();
    const recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
      size: 'invisible',
    });
    const provider = new PhoneAuthProvider(auth);
    const verificationId = await provider.verifyPhoneNumber(phoneNumber, recaptchaVerifier);
    // Return a ConfirmationResult-like object
    return {
      verificationId,
      confirm: async (code: string) => {
        const credential = PhoneAuthProvider.credential(verificationId, code);
        if (auth.currentUser) {
          const result = await linkWithCredential(auth.currentUser, credential);
          return result;
        }
        throw new Error('No current user to link phone number');
      },
    } as unknown as ConfirmationResult;
  };

  const signInWithPhone = async (phoneNumber: string, recaptchaContainerId: string): Promise<ConfirmationResult> => {
    const auth = getFirebaseAuthClient();
    const recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
      size: 'invisible',
    });
    const provider = new PhoneAuthProvider(auth);
    const verificationId = await provider.verifyPhoneNumber(phoneNumber, recaptchaVerifier);
    return {
      verificationId,
      confirm: async (code: string) => {
        const credential = PhoneAuthProvider.credential(verificationId, code);
        const result = await signInWithCredential(auth, credential);
        return result;
      },
    } as unknown as ConfirmationResult;
  };

  const verifyPhoneOtp = async (confirmationResult: ConfirmationResult, code: string): Promise<void> => {
    await confirmationResult.confirm(code);
  };

  const linkPhoneToAccount = async (verificationId: string, code: string): Promise<void> => {
    const auth = getFirebaseAuthClient();
    const credential = PhoneAuthProvider.credential(verificationId, code);
    if (auth.currentUser) {
      await linkWithCredential(auth.currentUser, credential);
    } else {
      throw new Error('No current user to link phone number');
    }
  };

  const signOut = async () => {
    await fbSignOut(getFirebaseAuthClient());
    // Redirect to home page (which will redirect to marketing site if logged out)
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signUpWithEmail, signInWithEmail, sendPhoneOtp, signInWithPhone, verifyPhoneOtp, linkPhoneToAccount, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
