import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { ISODateTime } from '@nexigrate/shared';
import { requireAnyAdmin } from '../auth.js';
import type { Env } from '../env.js';
import type { AdminUserStore } from '../lib/adminUserStore.js';
import type { AuditAction, AuditLogStore } from '../lib/auditLogStore.js';
import type { Logger } from '../logger.js';

/**
 * Phase 20 -- audit log viewer.
 *
 *   GET /v1/admin/audit?action=&actorUid=&beforeOccurredAt=&limit=
 *
 * Read-only; the only writers to this collection are the routes that
 * mint audit entries (admin-users grant-credits etc.). Gated at
 * `support_admin` since it's read-only.
 */
export interface AdminAuditRoutesDeps {
  env: Env;
  audit: AuditLogStore;
  admins: AdminUserStore;
  logger: Logger;
}

const ACTIONS: AuditAction[] = [
  'admin.users.grant_credits',
  'admin.users.revoke_credits',
  'admin.users.suspend',
  'admin.users.unsuspend',
  'admin.team.add_admin',
  'admin.team.revoke_admin',
  'admin.content.approve',
  'admin.content.reject',
];

const listSchema = z.object({
  action: z
    .string()
    .optional()
    .refine((v) => v === undefined || (ACTIONS as string[]).includes(v), {
      message: 'unknown action',
    }),
  actorUid: z.string().max(128).optional(),
  beforeOccurredAt: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export function makeAdminAuditRoutes(deps: AdminAuditRoutesDeps): Hono {
  const app = new Hono();
  const { env, audit, admins } = deps;

  app.get('/audit', async (c) => {
    await requireAnyAdmin(c, env, admins, 'support_admin');
    const parsed = listSchema.safeParse({
      action: c.req.query('action'),
      actorUid: c.req.query('actorUid'),
      beforeOccurredAt: c.req.query('beforeOccurredAt'),
      limit: c.req.query('limit'),
    });
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: parsed.error.issues[0]?.message ?? 'invalid query',
      });
    }
    const rows = await audit.list({
      action: parsed.data.action as AuditAction | undefined,
      actorUid: parsed.data.actorUid,
      beforeOccurredAt: parsed.data.beforeOccurredAt as ISODateTime | undefined,
      limit: parsed.data.limit ?? 50,
    });
    return c.json({
      entries: rows,
      nextCursor: rows.length > 0 ? rows[rows.length - 1]!.occurredAt : null,
    });
  });

  // Static catalogue so the UI can render the action filter without
  // duplicating the type union on the frontend.
  app.get('/audit/actions', async (c) => {
    await requireAnyAdmin(c, env, admins, 'support_admin');
    return c.json({ actions: ACTIONS });
  });

  return app;
}
