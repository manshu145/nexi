/**
 * PR-40: FCM Web Push client helper.
 *
 * Handles:
 *  1. Notification permission request
 *  2. FCM token retrieval via firebase/messaging
 *  3. Token registration with our backend (POST /v1/users/push-token)
 *
 * NOTE: The firebase-messaging-sw.js service worker handles background
 * notifications. This module handles foreground token registration only.
 */

import { api } from './api';

let tokenRegistered = false;

/**
 * Request push permission + register FCM token with backend.
 * Returns true if token was successfully registered, false otherwise.
 * Safe to call multiple times — de-duplicates internally.
 */
export async function registerPushToken(): Promise<boolean> {
  if (tokenRegistered) return true;
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    // Dynamic import to avoid loading firebase/messaging on pages that
    // don't need push (keeps main bundle small).
    const { getMessaging, getToken } = await import('firebase/messaging');
    const { getApp } = await import('firebase/app');

    const app = getApp();
    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? '',
      serviceWorkerRegistration: await navigator.serviceWorker.register('/firebase-messaging-sw.js'),
    });

    if (!token) return false;

    // Register with backend
    await api.registerPushToken(token, 'web');
    tokenRegistered = true;
    return true;
  } catch (err) {
    console.warn('[push] Failed to register token:', err);
    return false;
  }
}
