'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { getFirebaseAuthClient } from '~/lib/firebase';

type Step = 'choose' | 'phone' | 'otp';

export default function SignInPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('choose');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  // Phase 16: capture `?ref=CODE` from the URL into sessionStorage so the
  // referral attribution survives the Firebase auth redirect. The dashboard
  // applies it on the first authenticated landing.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const ref = url.searchParams.get('ref');
    if (ref && /^[A-Z0-9]{4,20}$/i.test(ref)) {
      try {
        sessionStorage.setItem('nexigrate.refCode', ref.toUpperCase());
      } catch {
        /* sessionStorage blocked -- attribution silently fails, no error */
      }
    }
  }, []);

  // Initialize an invisible reCAPTCHA verifier once per page load. Firebase
  // requires it to gate Phone Auth requests (anti-abuse). It binds to a
  // hidden div and resolves silently for legitimate users.
  useEffect(() => {
    if (!recaptchaContainerRef.current) return;
    if (recaptchaVerifierRef.current) return;
    try {
      const auth = getFirebaseAuthClient();
      recaptchaVerifierRef.current = new RecaptchaVerifier(
        auth,
        recaptchaContainerRef.current,
        { size: 'invisible' },
      );
    } catch {
      // Best-effort: if reCAPTCHA can't init we still let Google sign-in work.
    }
    return () => {
      try {
        recaptchaVerifierRef.current?.clear();
      } catch {
        /* ignore */
      }
      recaptchaVerifierRef.current = null;
    };
  }, []);

  async function onGoogle() {
    try {
      setError(null);
      setSubmitting(true);
      await signInWithGoogle();
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'sign-in failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSendOtp() {
    const e164 = normalizeIndianPhone(phone);
    if (!e164) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!recaptchaVerifierRef.current) {
      setError('Verification not ready. Please refresh the page.');
      return;
    }
    try {
      setError(null);
      setSubmitting(true);
      const auth = getFirebaseAuthClient();
      confirmationRef.current = await signInWithPhoneNumber(
        auth,
        e164,
        recaptchaVerifierRef.current,
      );
      setStep('otp');
    } catch (e) {
      setError(humanizePhoneError(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerifyOtp() {
    if (!confirmationRef.current) {
      setError('OTP session expired. Please request a fresh code.');
      setStep('phone');
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code.');
      return;
    }
    try {
      setError(null);
      setSubmitting(true);
      await confirmationRef.current.confirm(otp);
      router.replace('/dashboard');
    } catch (e) {
      setError(humanizePhoneError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 pt-10">
      <Logo />

      <section className="paper-card mt-12 p-7 sm:p-9">
        <p className="pill mb-5">Welcome</p>
        <h1 className="font-serif text-3xl font-semibold leading-tight text-ink-900 sm:text-4xl">
          Sign in to Nexigrate
        </h1>
        <p className="mt-3 text-ink-800">Free forever. No ads. No distractions.</p>

        {step === 'choose' ? (
          <>
            <button
              type="button"
              onClick={onGoogle}
              disabled={submitting}
              className="btn-primary mt-7 w-full"
            >
              <GoogleIcon />
              {submitting ? 'Signing in...' : 'Continue with Google'}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep('phone');
              }}
              disabled={submitting}
              className="btn-ghost mt-3 w-full"
            >
              Continue with phone (OTP)
            </button>
            <p className="mt-6 text-xs text-muted-500">
              Phone OTP works without a Gmail account.
            </p>
          </>
        ) : null}

        {step === 'phone' ? (
          <div className="mt-7 space-y-3">
            <label htmlFor="phone" className="block text-sm font-medium text-ink-900">
              Mobile number
            </label>
            <div className="flex items-stretch gap-2">
              <span className="flex items-center rounded-md border border-ink-900/10 bg-paper-200 px-3 text-ink-800">
                +91
              </span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                }
                placeholder="98765 43210"
                className="input flex-1"
                maxLength={10}
              />
            </div>
            <button
              type="button"
              onClick={onSendOtp}
              disabled={submitting || phone.length !== 10}
              className="btn-primary w-full"
            >
              {submitting ? 'Sending OTP...' : 'Send OTP'}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep('choose');
              }}
              className="btn-ghost-sm w-full"
            >
              Back
            </button>
            <p className="text-xs text-muted-500">
              Standard SMS rates apply. We never share your number.
            </p>
          </div>
        ) : null}

        {step === 'otp' ? (
          <div className="mt-7 space-y-3">
            <p className="text-sm text-ink-800">
              Enter the 6-digit code we sent to{' '}
              <span className="font-medium text-ink-900">+91 {phone}</span>
            </p>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="input w-full text-center font-serif text-2xl tracking-[0.4em]"
              maxLength={6}
            />
            <button
              type="button"
              onClick={onVerifyOtp}
              disabled={submitting || otp.length !== 6}
              className="btn-primary w-full"
            >
              {submitting ? 'Verifying...' : 'Verify and continue'}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setOtp('');
                setStep('phone');
              }}
              className="btn-ghost-sm w-full"
            >
              Change number
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-ember-600" role="alert">
            {error}
          </p>
        ) : null}

        {/* Invisible reCAPTCHA mounts here. Required by Firebase Phone Auth. */}
        <div ref={recaptchaContainerRef}></div>

        <p className="mt-6 text-xs text-muted-500">
          By continuing, you agree to our{' '}
          <a href="https://nexigrate.com/terms" className="text-ember-600 underline">
            Terms
          </a>{' '}
          and{' '}
          <a href="https://nexigrate.com/privacy" className="text-ember-600 underline">
            Privacy Policy
          </a>
          .
        </p>
      </section>
    </main>
  );
}

function normalizeIndianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    return `+${digits}`;
  }
  return null;
}

function humanizePhoneError(e: unknown): string {
  const code = (e as { code?: string }).code ?? '';
  switch (code) {
    case 'auth/invalid-phone-number':
      return "That number doesn't look right. Use a 10-digit Indian mobile.";
    case 'auth/missing-phone-number':
      return 'Please enter your phone number first.';
    case 'auth/quota-exceeded':
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait 15 minutes and try again.';
    case 'auth/invalid-verification-code':
      return 'Wrong OTP. Please re-enter the 6-digit code.';
    case 'auth/code-expired':
      return 'OTP expired. Please request a fresh one.';
    case 'auth/captcha-check-failed':
      return 'Bot check failed. Please refresh the page.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return e instanceof Error ? e.message : 'Sign-in failed';
  }
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#FFFFFF"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#FFFFFF"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FFFFFF"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#FFFFFF"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.892 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
