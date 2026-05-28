'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '~/lib/auth-context';
import { Logo } from '~/components/Logo';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getFirebaseAuthClient } from '~/lib/firebase';

type AuthMode = 'signin' | 'signup';
type AuthTab = 'google' | 'email' | 'phone';

export default function SignInPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const { user, loading, signInWithGoogle, signUpWithEmail, signInWithEmail, signInWithPhone, verifyPhoneOtp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [activeTab, setActiveTab] = useState<AuthTab>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('+91');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<'number' | 'otp'>('number');
  const [phoneConfirmation, setPhoneConfirmation] = useState<any>(null);
  const [phoneCountdown, setPhoneCountdown] = useState(0);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // Store referral code from ?ref= query param
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      localStorage.setItem('pendingReferral', ref);
    }
  }, [searchParams]);

  useEffect(() => { if (!loading && user) router.replace('/dashboard'); }, [user, loading, router]);

  // Countdown for phone OTP resend
  useEffect(() => {
    if (phoneCountdown <= 0) return;
    const timer = setInterval(() => setPhoneCountdown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [phoneCountdown]);

  const handleGoogleSignIn = async () => {
    setSigningIn(true); setError(null);
    try { await signInWithGoogle(); } catch (err) { setError(err instanceof Error ? err.message : 'Sign in failed'); setSigningIn(false); }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Please enter your email address first, then click Forgot password');
      return;
    }
    setError(null);
    try {
      await sendPasswordResetEmail(getFirebaseAuthClient(), email.trim());
      setResetSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email';
      if (msg.includes('auth/user-not-found')) setError('No account found with this email.');
      else if (msg.includes('auth/invalid-email')) setError('Please enter a valid email address.');
      else setError(msg);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    setSigningIn(true);
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password);
        router.push('/verify-phone');
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      if (msg.includes('auth/email-already-in-use')) setError('This email is already registered. Please sign in instead.');
      else if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) setError('Invalid email or password.');
      else if (msg.includes('auth/user-not-found')) setError('No account found with this email. Please sign up.');
      else if (msg.includes('auth/weak-password')) setError('Password is too weak. Use at least 6 characters.');
      else if (msg.includes('auth/invalid-email')) setError('Please enter a valid email address.');
      else if (msg.includes('auth/too-many-requests')) setError('Too many attempts. Please try again later.');
      else setError(msg);
      setSigningIn(false);
    }
  };

  const handlePhoneSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 12) {
      setError('Please enter a valid phone number with country code (e.g. +91XXXXXXXXXX)');
      return;
    }
    setSigningIn(true);
    try {
      const result = await signInWithPhone(cleanPhone, 'phone-recaptcha-container');
      setPhoneConfirmation(result);
      setPhoneStep('otp');
      setPhoneCountdown(30);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send OTP';
      if (msg.includes('auth/invalid-phone-number')) setError('Invalid phone number format. Use +91XXXXXXXXXX');
      else if (msg.includes('auth/too-many-requests')) setError('Too many attempts. Please wait before trying again.');
      else setError(msg);
    } finally { setSigningIn(false); }
  };

  const handlePhoneVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phoneOtp || phoneOtp.length < 6) {
      setError('Please enter the 6-digit OTP');
      return;
    }
    if (!phoneConfirmation) {
      setError('Session expired. Please resend OTP.');
      return;
    }
    setSigningIn(true);
    try {
      await verifyPhoneOtp(phoneConfirmation, phoneOtp);
      // Will redirect via the user effect
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      if (msg.includes('auth/invalid-verification-code')) setError('Invalid OTP. Please check and try again.');
      else if (msg.includes('auth/code-expired')) setError('OTP has expired. Please request a new one.');
      else setError(msg);
      setSigningIn(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center"><div className="paper-card w-full max-w-sm p-8 animate-pulse space-y-4"><div className="h-6 w-24 mx-auto rounded bg-paper-200" /><div className="h-4 w-32 mx-auto rounded bg-paper-200" /><div className="h-10 w-full rounded-xl bg-paper-200 mt-8" /><div className="h-10 w-full rounded-xl bg-paper-200" /><div className="h-10 w-full rounded-xl bg-paper-200" /></div></main>;
  if (user) return <main className="flex min-h-screen items-center justify-center"><div className="paper-card w-full max-w-sm p-8 animate-pulse space-y-4"><div className="h-6 w-24 mx-auto rounded bg-paper-200" /><div className="h-4 w-48 mx-auto rounded bg-paper-200" /></div></main>;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="paper-card w-full max-w-sm p-8 text-center">
        <Logo height={40} className="mx-auto" />
        <p className="mt-2 text-sm text-muted-500">{tc('tagline')}</p>

        {/* Auth method tabs */}
        <div className="mt-6 flex rounded-xl bg-paper-200 p-1">
          <button onClick={() => { setActiveTab('google'); setError(null); }} className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${activeTab === 'google' ? 'bg-paper-50 text-ink-900 shadow-sm' : 'text-muted-500 hover:text-ink-700'}`}>Google</button>
          <button onClick={() => { setActiveTab('email'); setError(null); }} className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${activeTab === 'email' ? 'bg-paper-50 text-ink-900 shadow-sm' : 'text-muted-500 hover:text-ink-700'}`}>Email</button>
          <button onClick={() => { setActiveTab('phone'); setError(null); }} className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${activeTab === 'phone' ? 'bg-paper-50 text-ink-900 shadow-sm' : 'text-muted-500 hover:text-ink-700'}`}>Mobile OTP</button>
        </div>

        {/* Google sign-in */}
        {activeTab === 'google' && (
          <div className="mt-6">
            <button type="button" onClick={handleGoogleSignIn} disabled={signingIn} className="btn-primary w-full gap-3">
              <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              {signingIn ? t('signingIn') : t('signInWithGoogle')}
            </button>
            <p className="mt-4 text-xs text-muted-400">Recommended — fastest way to sign in</p>
          </div>
        )}

        {/* Email/Password form */}
        {activeTab === 'email' && (
          <>
            <form onSubmit={handleEmailSubmit} className="mt-6 space-y-3 text-left">
              <div>
                <label htmlFor="email" className="text-xs font-medium text-ink-700">Email</label>
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="input mt-1" />
              </div>
              <div>
                <label htmlFor="password" className="text-xs font-medium text-ink-700">Password</label>
                <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Min 6 characters' : 'Enter password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="input mt-1" />
              </div>
              {mode === 'signup' && (
                <div>
                  <label htmlFor="confirmPassword" className="text-xs font-medium text-ink-700">Confirm Password</label>
                  <input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" className="input mt-1" />
                </div>
              )}
              <button type="submit" disabled={signingIn} className="btn-primary w-full mt-2">
                {signingIn ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Sign In with Email'}
              </button>
              {mode === 'signin' && (
                <button type="button" onClick={handleForgotPassword} className="mt-2 text-xs text-ember-600 hover:underline w-full text-right">
                  Forgot password?
                </button>
              )}
            </form>
            <p className="mt-5 text-sm text-muted-500">
              {mode === 'signin' ? (
                <>Don&apos;t have an account?{' '}
                  <button type="button" onClick={() => { setMode('signup'); setError(null); }} className="font-medium text-ember-600 hover:underline">Sign Up</button>
                </>
              ) : (
                <>Already have an account?{' '}
                  <button type="button" onClick={() => { setMode('signin'); setError(null); }} className="font-medium text-ember-600 hover:underline">Sign In</button>
                </>
              )}
            </p>
          </>
        )}

        {/* Mobile OTP */}
        {activeTab === 'phone' && (
          <div className="mt-6">
            {phoneStep === 'number' ? (
              <form onSubmit={handlePhoneSendOtp} className="space-y-4 text-left">
                <div>
                  <label htmlFor="signin-phone" className="text-xs font-medium text-ink-700">Phone Number</label>
                  <input
                    id="signin-phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+91XXXXXXXXXX"
                    autoComplete="tel"
                    className="input mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-400">We&apos;ll send a 6-digit OTP to this number</p>
                </div>
                <button type="submit" disabled={signingIn} className="btn-primary w-full">
                  {signingIn ? 'Sending...' : 'Send OTP'}
                </button>
              </form>
            ) : (
              <form onSubmit={handlePhoneVerifyOtp} className="space-y-4 text-left">
                <p className="text-sm text-muted-500 text-center">OTP sent to <strong>{phone}</strong></p>
                <div>
                  <label htmlFor="signin-otp" className="text-xs font-medium text-ink-700">Enter OTP</label>
                  <input
                    id="signin-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={phoneOtp}
                    onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                    autoComplete="one-time-code"
                    className="input mt-1 text-center text-lg font-mono tracking-widest"
                  />
                </div>
                <button type="submit" disabled={signingIn} className="btn-primary w-full">
                  {signingIn ? 'Verifying...' : 'Verify & Sign In'}
                </button>
                <div className="text-center">
                  {phoneCountdown > 0 ? (
                    <p className="text-xs text-muted-500">Resend in {phoneCountdown}s</p>
                  ) : (
                    <button type="button" onClick={handlePhoneSendOtp} disabled={signingIn} className="text-xs font-medium text-ember-600 hover:underline">Resend OTP</button>
                  )}
                </div>
                <button type="button" onClick={() => { setPhoneStep('number'); setPhoneOtp(''); setError(null); }} className="btn-ghost w-full text-sm">← Change Number</button>
              </form>
            )}
            {/* Invisible recaptcha for phone auth */}
            <div id="phone-recaptcha-container" />
          </div>
        )}

        {error && <div className="banner banner-error mt-4">{error}</div>}
        {resetSent && <div className="banner mt-4 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2 text-sm">Password reset email sent! Check your inbox.</div>}

        {/* Referral Code Input */}
        <div className="mt-5 border-t border-line pt-4">
          <details className="text-left">
            <summary className="text-xs text-muted-500 cursor-pointer hover:text-ink-700">Have a referral code?</summary>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                placeholder="Enter code (e.g. ABCD1234)"
                maxLength={8}
                className="input flex-1 text-xs font-mono uppercase tracking-wider"
                defaultValue={typeof window !== 'undefined' ? localStorage.getItem('pendingReferral') || '' : ''}
                onChange={(e) => {
                  const code = e.target.value.trim().toUpperCase();
                  if (code) localStorage.setItem('pendingReferral', code);
                  else localStorage.removeItem('pendingReferral');
                }}
              />
              <span className="text-[10px] text-muted-400">+25 credits</span>
            </div>
          </details>
        </div>
      </div>
    </main>
  );
}
