/**
 * PR-40: FCM Web Push client helper.
 *
 * Handles:
 *  1. Notification permission request
 *  2. FCM token retrieval via firebase/messaging
 *  3. Token registration with our backend (POST /v1/users/me/push-tokens)
 *
 * PR-48: VAPID key is fetched at runtime from /v1/branding endpoint
 * (reads from admin panel → Service Keys → FCM → vapidKey). No build-time
 * env var needed — admin pastes the key in /admin/service-keys → FCM, done.
 *
 * NOTE: The firebase-messaging-sw.js service worker handles background
 * notifications. This module handles foreground token registration only.
 */

import { api } from './api';

let tokenRegistered = false;
let cachedVapidKey: string | null = null;
/** Last failure reason from registerPushToken — surfaced to the UI so the
 *  user/admin sees the ACTUAL cause instead of a generic "VAPID missing". */
let lastPushError: string | null = null;

export function getLastPushError(): string | null {
  return lastPushError;
}

/** Fetch VAPID key from branding endpoint (cached after first call) */
async function getVapidKey(): Promise<string> {
  if (cachedVapidKey) return cachedVapidKey;
  // Try build-time env first (for local dev)
  const envKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '';
  if (envKey) { cachedVapidKey = envKey; return envKey; }
  // Fetch from branding API (reads from admin Service Keys → FCM → vapidKey)
  try {
    const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'https://api.nexigrate.com';
    const res = await fetch(`${API}/v1/branding`);
    if (res.ok) {
      const data = await res.json() as { vapidKey?: string };
      if (data.vapidKey) { cachedVapidKey = data.vapidKey; return data.vapidKey; }
    }
  } catch { /* fall through */ }
  return '';
}

/**
 * Request push permission + register FCM token with backend.
 * Returns true if token was successfully registered, false otherwise.
 * Safe to call multiple times — de-duplicates internally.
 */
export async function registerPushToken(): Promise<boolean> {
  if (tokenRegistered) return true;
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) { lastPushError = 'This browser does not support notifications.'; return false; }
  lastPushError = null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { lastPushError = 'Notification permission was not granted.'; return false; }

    const vapidKey = await getVapidKey();
    if (!vapidKey) {
      lastPushError = 'VAPID key not configured. Admin → Service Keys → FCM → paste vapidKey.';
      console.warn('[push]', lastPushError);
      return false;
    }

    // Dynamic import to avoid loading firebase/messaging on pages that
    // don't need push (keeps main bundle small).
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    const { getApp } = await import('firebase/app');

    // Some browsers (iOS Safari < 16.4, certain in-app webviews) don't
    // support FCM web push at all — surface that clearly.
    if (!(await isSupported())) {
      lastPushError = 'Push notifications are not supported in this browser (try Chrome, or install the app).';
      return false;
    }

    const app = getApp();
    const messaging = getMessaging(app);

    // Service worker registration may fail if file doesn't exist or
    // HTTPS is not available.
    let swRegistration: ServiceWorkerRegistration | undefined;
    try {
      swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      // Wait until the SW is ACTIVE before getToken — calling getToken while
      // the worker is still "installing"/"waiting" is a common cause of a
      // silent failure / empty token on the FIRST attempt (which then looked
      // like "VAPID not configured"). Bounded by a 5s safety timeout.
      const pending = swRegistration.installing || swRegistration.waiting;
      if (pending && swRegistration.active == null) {
        await new Promise<void>((resolve) => {
          pending.addEventListener('statechange', () => {
            if (pending.state === 'activated') resolve();
          });
          setTimeout(resolve, 5000);
        });
      }
    } catch (swErr) {
      lastPushError = `Service worker registration failed: ${swErr instanceof Error ? swErr.message : String(swErr)}`;
      console.warn('[push]', lastPushError);
      return false;
    }

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      lastPushError = 'Token request returned empty — the browser blocked it or the VAPID key is invalid for this Firebase project.';
      console.warn('[push]', lastPushError);
      return false;
    }

    // Register with backend
    await api.registerPushToken(token, 'web');
    tokenRegistered = true;
    lastPushError = null;
    return true;
  } catch (err) {
    // getToken throws here for the most common real failures:
    //  - "messaging/token-subscribe-failed" → VAPID key wrong for project
    //  - "applicationServerKey is not valid" → malformed VAPID key
    //  - missing messagingSenderId in the Firebase app config (fixed in #267)
    lastPushError = err instanceof Error ? err.message : String(err);
    console.warn('[push] Failed to register token:', err);
    return false;
  }
}
