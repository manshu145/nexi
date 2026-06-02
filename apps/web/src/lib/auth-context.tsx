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

/**
 * Google sign-in popups are unreliable on mobile browsers and (especially)
 * installed PWAs in standalone display mode: the popup opens, the user picks
 * an account, but the result can't post back to the opener — so the account
 * picker reappears and the flow appears to "loop" 2-3 times (founder report).
 *
 * On those environments we use the REDIRECT flow instead, which navigates the
 * whole page to Google and back — rock-solid everywhere. Desktop keeps the
 * popup (nicer UX, no full-page nav).
 */
function shouldUseRedirect(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent);
  return Boolean(standalone || mobile);
}

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
    // Always show the account chooser (prevents silent re-use of a stale
    // session that can also trigger the re-select loop).
    provider.setCustomParameters({ prompt: 'select_account' });

    // Mobile / PWA → redirect (reliable). Page navigates away; the result is
    // picked up by getRedirectResult + onAuthStateChanged on return.
    if (shouldUseRedirect()) {
      await signInWithRedirect(auth, provider);
      return;
    }

    // Desktop → popup, with a redirect fallback if the popup is blocked,
    // closed, or superseded (the conditions behind the "opens again" loop).
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        await signInWithRedirect(auth, provider);
        return;
      }
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
