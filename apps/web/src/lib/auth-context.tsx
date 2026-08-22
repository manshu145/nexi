'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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
    const auth = getFirebaseAuthClient();
    // Complete any pending redirect sign-in (mobile/PWA Google flow). This
    // consumes the result + surfaces errors; onAuthStateChanged then fires
    // with the signed-in user. Safe no-op when there's no pending redirect.
    getRedirectResult(auth).catch(() => { /* no pending redirect / handled by listener */ });
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInWithGoogle = async () => {
    const auth = getFirebaseAuthClient();
    const provider = new GoogleAuthProvider();
    // Always show the account chooser (avoids silent stale-session re-use).
    provider.setCustomParameters({ prompt: 'select_account' });

    // POPUP-FIRST on every device. The app runs on app.nexigrate.com while
    // the Firebase authDomain is nexigrate-prod.firebaseapp.com — and
    // signInWithRedirect is broken by modern browsers' third-party storage
    // partitioning in that cross-domain setup (getRedirectResult can't read
    // the pending result → user returns to /signin NOT signed in: the loop).
    // signInWithPopup delivers the credential DIRECTLY to the opener window,
    // which writes it to app.nexigrate.com's own IndexedDB — so it works
    // regardless of the authDomain. We only fall back to redirect when the
    // popup itself can't open (blocked / in-app webview that bans popups).
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/cancelled-popup-request'
      ) {
        // Popup couldn't open — last resort. (Most in-app browsers that
        // block popups also handle the full-page redirect fine.)
        await signInWithRedirect(auth, provider);
        return;
      }
      // auth/popup-closed-by-user etc. → surface to the caller (the signin
      // page shows the message + re-enables the button). NOT a silent loop.
      throw err;
    }
  };

  const signUpWithEmail = async (email: string, password: string): Promise<User> => {
    const cred = await createUserWithEmailAndPassword(getFirebaseAuthClient(), email, password);
    return cred.user;
  };

  const signInWithEmail = async (email: string, password: string): Promise<User> => {
    const cred = await signInWithEmailAndPassword(getFirebaseAuthClient(), email, password);
    return cred.user;
  };

  // Reuse a single RecaptchaVerifier per container to avoid Firebase's
  // "reCAPTCHA already rendered in this element" error on resend OTP.
  const recaptchaCache = useRef<Map<string, RecaptchaVerifier>>(new Map());

  const getOrCreateRecaptcha = (containerId: string): RecaptchaVerifier => {
    const auth = getFirebaseAuthClient();
    const existing = recaptchaCache.current.get(containerId);
    if (existing) return existing;
    const verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
    recaptchaCache.current.set(containerId, verifier);
    return verifier;
  };

  const sendPhoneOtp = async (phoneNumber: string, recaptchaContainerId: string): Promise<ConfirmationResult> => {
    const auth = getFirebaseAuthClient();
    const recaptchaVerifier = getOrCreateRecaptcha(recaptchaContainerId);
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
    const recaptchaVerifier = getOrCreateRecaptcha(recaptchaContainerId);
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
