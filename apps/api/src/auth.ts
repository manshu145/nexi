import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Auth } from 'firebase-admin/auth';
import type { UserId } from '@nexigrate/shared';
import { asUserId } from '@nexigrate/shared';

export interface Principal {
  userId: UserId;
  email: string;
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
      const principal: Principal = {
        userId: asUserId(decoded.uid),
        email: decoded.email ?? '',
      };
      c.set(PRINCIPAL_KEY, principal);
    } catch {
      throw new HTTPException(401, { message: 'invalid or expired token' });
    }

    await next();
  };
}

export function requireAuth(c: Context): Principal {
  const principal = c.get(PRINCIPAL_KEY) as Principal | undefined;
  if (!principal) {
    throw new HTTPException(401, { message: 'authentication required' });
  }
  return principal;
}
