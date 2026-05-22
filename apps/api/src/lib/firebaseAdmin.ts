import {
  cert,
  getApps,
  initializeApp,
  applicationDefault,
  type App,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Env } from '../env.js';

/**
 * Firebase Admin SDK initialisation.
 *
 * Three credential sources, tried in order:
 *
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON env var -- the entire service-account
 *      JSON pasted as a single secret. Used by GitHub Actions and as a
 *      local-laptop fallback.
 *   2. GOOGLE_APPLICATION_CREDENTIALS env var pointing at a JSON file --
 *      the standard `gcloud auth application-default login` flow.
 *   3. Workload Identity (the Cloud Run runtime path). The metadata server
 *      provides credentials automatically; no env var needed.
 *
 * Phase 2.2 keeps these three paths so the same image runs in dev (1 or 2)
 * and prod (3) without code changes.
 */

let cachedApp: App | null = null;

export function getFirebaseAdminApp(env: Env): App {
  if (cachedApp) return cachedApp;

  const existing = getApps().find((a) => a.name === '[DEFAULT]');
  if (existing) {
    cachedApp = existing;
    return cachedApp;
  }

  const inlineJson = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (inlineJson && inlineJson.trim().length > 0) {
    let parsed: { project_id?: string };
    try {
      parsed = JSON.parse(inlineJson);
    } catch {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON. ' +
          'Paste the entire service-account file content verbatim.',
      );
    }
    cachedApp = initializeApp({
      credential: cert(parsed as Parameters<typeof cert>[0]),
      projectId: parsed.project_id ?? env.GCP_PROJECT_ID,
    });
    return cachedApp;
  }

  // Application Default Credentials -- works for both
  // GOOGLE_APPLICATION_CREDENTIALS and Cloud Run workload identity.
  cachedApp = initializeApp({
    credential: applicationDefault(),
    ...(env.GCP_PROJECT_ID ? { projectId: env.GCP_PROJECT_ID } : {}),
  });
  return cachedApp;
}

export function getFirebaseAuth(env: Env): Auth {
  return getAuth(getFirebaseAdminApp(env));
}

export function getFirebaseFirestore(env: Env): Firestore {
  const fs = getFirestore(getFirebaseAdminApp(env));
  if (!(fs as unknown as { __nexiSettingsApplied?: true }).__nexiSettingsApplied) {
    fs.settings({ ignoreUndefinedProperties: true });
    (fs as unknown as { __nexiSettingsApplied: true }).__nexiSettingsApplied = true;
  }
  return fs;
}

/** Reset cached app -- exported for tests only. */
export function resetFirebaseAdminForTests(): void {
  cachedApp = null;
}
