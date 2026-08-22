import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Auth } from 'firebase-admin/auth';
import type { UserId } from '@nexigrate/shared';
import { asUserId } from '@nexigrate/shared';

export interface Principal {
  userId: UserId;
  email: string;
  /**
   * Firebase-verified phone number claim from the ID token, or null if the
   * user has not linked a phone number. This is the *only* trustworthy
   * source of phone identity -- never the request body or X-User-Phone
   * headers, which the client controls. Used by /v1/users/me to keep the
   * Firestore mirror of `phone` and `phoneVerified` in lock-step with
   * Firebase Auth.
   */
  phoneNumber: string | null;
  /**
   * Firebase-verified email-verified claim. Google sign-in and most other
   * providers set this to true on issue; phone-only users have null email
   * and false email_verified. Stored here for completeness; downstream
   * code currently keys gating on `phoneNumber`.
   */
  emailVerified: boolean;
  /**
   * Display name carried in the Firebase ID token. For Google sign-in this
   * is the Google profile name; for phone-only users it is typically null
   * because Firebase has no source for it. The /me handler falls back to
   * the email-prefix when this is null so a freshly-signed-up user still
   * gets a reasonable default rather than a blank string.
   *
   * Lock §1.5 (header spoofing fix): we read this from the verified ID
   * token claims instead of the X-User-Name request header so the client
   * cannot forge a name (which would have allowed e.g. impersonating
   * another user in the admin UI).
   */
  name: string | null;
  /**
   * Profile picture URL from the Firebase token. Same trust reasoning as
   * `name` above -- previously read from the X-User-Photo header, now
   * read from `decoded.picture` so the client cannot inject arbitrary
   * URLs (XSS via avatar) into other users' Firestore docs.
   */
  picture: string | null;
  /**
   * Normalised sign-in provider, derived from `decoded.firebase.sign_in_provider`.
   * Only two values matter to downstream code: 'phone' (phone-only signup)
   * vs 'google' (everything else: google.com, password, custom). The
   * userStore distinguishes phone signups for analytics + the dashboard
   * guard, so we collapse the long tail into 'google'.
   */
  signInProvider: 'google' | 'phone';
}

const PRINCIPAL_KEY = 'principal';

export function authMiddleware(auth: Auth) {
  return async (c: Context, next: Next) => {
    const header = c.req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'missing or invalid authorization header' });
    }
    const token = header.slice(7);
    try {
      const decoded = await auth.verifyIdToken(token);
      // `firebase.sign_in_provider` is the canonical Firebase claim for
      // "how did this token get issued". 'phone' is the only value we
      // treat specially (phone-only signups never have an email); every
      // other provider (google.com, password, oidc.*, etc.) collapses
      // to 'google' downstream.
      const rawProvider = (decoded.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
      const signInProvider: 'google' | 'phone' = rawProvider === 'phone' ? 'phone' : 'google';
      c.set(PRINCIPAL_KEY, {
        userId: asUserId(decoded.uid),
        email: decoded.email ?? '',
        phoneNumber: decoded.phone_number ?? null,
        emailVerified: Boolean(decoded.email_verified),
        name: typeof decoded.name === 'string' ? decoded.name : null,
        picture: typeof decoded.picture === 'string' ? decoded.picture : null,
        signInProvider,
      } as Principal);
    } catch {
      throw new HTTPException(401, { message: 'invalid or expired token' });
    }
    await next();
  };
}

export function requireAuth(c: Context): Principal {
  const principal = c.get(PRINCIPAL_KEY) as Principal | undefined;
  if (!principal) throw new HTTPException(401, { message: 'authentication required' });
  return principal;
}
