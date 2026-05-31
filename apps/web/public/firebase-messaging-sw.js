/* eslint-disable no-undef */
// Firebase Cloud Messaging Service Worker — PR-40
// This file MUST live at the web root (/firebase-messaging-sw.js) for
// Firebase to intercept background push events.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBNexigrate', // public browser key — not a secret
  projectId: 'nexigrate-prod',
  messagingSenderId: '748359012345',
  appId: '1:748359012345:web:abc123',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'Nexigrate';
  const options = {
    body: payload.notification?.body ?? '',
    icon: '/brand/nexigrate-favicon.svg',
    badge: '/brand/nexigrate-favicon.svg',
    data: payload.data,
  };
  self.registration.showNotification(title, options);
});

// Handle notification click — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
