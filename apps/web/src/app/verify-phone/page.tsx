'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';
import type { ConfirmationResult } from 'firebase/auth';

export default function VerifyPhonePage() {
  const { user, loading, sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [countdown, setCountdown] = useState(0);
  const recaptchaRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  // Check if user already has phone linked
  useEffect(() => {
    if (user) {
      const hasPhone = user.providerData.some(p => p.providerId === 'phone');
      if (hasPhone) {
        router.replace('/dashboard');
      }
    }
  }, [user, router]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setError('Please enter a valid phone number with country code (e.g. +91XXXXXXXXXX)');
      return;
    }

    setSending(true);
    try {
      const result = await sendPhoneOtp(cleanPhone, 'recaptcha-container');
      setConfirmationResult(result);
      setStep('otp');
      setCountdown(60);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send OTP';
      if (msg.includes('auth/invalid-phone-number')) setError('Invalid phone number format. Use +91XXXXXXXXXX');
      else if (msg.includes('auth/too-many-requests')) setError('Too many attempts. Please wait before trying again.');
      else if (msg.includes('auth/quota-exceeded')) setError('SMS quota exceeded. Please try again later.');
      else setError(msg);
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otp || otp.length < 6) {
      setError('Please enter the 6-digit OTP');
      return;
    }

    if (!confirmationResult) {
      setError('Session expired. Please resend OTP.');
      return;
    }

    setVerifying(true);
    try {
      await verifyPhoneOtp(confirmationResult, otp);
      // Save phone number to user profile in backend
      try {
        const { api } = await import('~/lib/api');
        await api.updateProfile({ phone: phone.trim() });
      } catch { /* non-critical — phone is already linked in Firebase Auth */ }
      // Phone successfully linked, redirect to onboarding or dashboard
      router.replace('/onboarding/language');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      if (msg.includes('auth/invalid-verification-code')) setError('Invalid OTP. Please check and try again.');
      else if (msg.includes('auth/code-expired')) setError('OTP has expired. Please request a new one.');
      else if (msg.includes('auth/credential-already-in-use')) setError('This phone number is already linked to another account.');
      else setError(msg);
    } finally {
      setVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setError(null);
    setSending(true);
    try {
      const result = await sendPhoneOtp(phone.trim(), 'recaptcha-container');
      setConfirmationResult(result);
      setCountdown(60);
      setOtp('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center"><AILoader context="general" /></main>;
  if (!user) return <main className="flex min-h-screen items-center justify-center"><AILoader context="general" /></main>;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="paper-card w-full max-w-sm p-8 text-center">
        <Logo className="text-2xl" />
        <div className="mt-6">
          <span className="text-4xl">📱</span>
          <h1 className="font-serif mt-3 text-xl font-semibold text-ink-900">Verify Your Phone</h1>
          <p className="mt-2 text-sm text-muted-500">
            {step === 'phone'
              ? 'Enter your phone number to receive a verification code.'
              : `We sent a 6-digit code to ${phone}`}
          </p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="mt-6 space-y-4 text-left">
            <div>
              <label htmlFor="phone" className="text-xs font-medium text-ink-700">Phone Number</label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91XXXXXXXXXX"
                autoComplete="tel"
                className="mt-1 w-full rounded-xl border border-paper-300 bg-paper-50 px-4 py-3 text-sm text-ink-900 placeholder:text-muted-400 focus:outline-none focus:ring-2 focus:ring-ember-500"
              />
              <p className="mt-1 text-xs text-muted-400">Include country code (e.g. +91 for India)</p>
            </div>
            <button type="submit" disabled={sending} className="btn-primary w-full">
              {sending ? 'Sending...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4 text-left">
            <div>
              <label htmlFor="otp" className="text-xs font-medium text-ink-700">Verification Code</label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                autoComplete="one-time-code"
                className="mt-1 w-full rounded-xl border border-paper-300 bg-paper-50 px-4 py-3 text-center text-lg font-mono tracking-widest text-ink-900 placeholder:text-muted-400 focus:outline-none focus:ring-2 focus:ring-ember-500"
              />
            </div>
            <button type="submit" disabled={verifying} className="btn-primary w-full">
              {verifying ? 'Verifying...' : 'Verify & Continue'}
            </button>
            <div className="text-center">
              {countdown > 0 ? (
                <p className="text-xs text-muted-500">Resend OTP in {countdown}s</p>
              ) : (
                <button type="button" onClick={handleResendOtp} disabled={sending} className="text-xs font-medium text-ember-600 dark:text-gold-500 hover:underline">
                  {sending ? 'Sending...' : 'Resend OTP'}
                </button>
              )}
            </div>
            <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError(null); }} className="btn-ghost w-full text-sm">
              ← Change Number
            </button>
          </form>
        )}

        {error && <div className="banner banner-error mt-4">{error}</div>}

        {/* Invisible recaptcha container */}
        <div id="recaptcha-container" ref={recaptchaRef} />
      </div>
    </main>
  );
}
