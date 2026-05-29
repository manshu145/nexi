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
      c.set(PRINCIPAL_KEY, {
        userId: asUserId(decoded.uid),
        email: decoded.email ?? '',
        phoneNumber: decoded.phone_number ?? null,
        emailVerified: Boolean(decoded.email_verified),
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
