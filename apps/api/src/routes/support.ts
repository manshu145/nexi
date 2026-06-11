import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { Firestore } from 'firebase-admin/firestore';

export interface SupportRoutesDeps { users: UserStore; db: Firestore | null; logger: Logger; }

export function makeSupportRoutes(deps: SupportRoutesDeps): Hono {
  const app = new Hono();

  // POST /v1/support/ticket
  app.post('/ticket', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null) as { subject?: string; message?: string } | null;
    if (!body?.subject || !body?.message) throw new HTTPException(400, { message: 'subject and message required' });

    const ticket = {
      id: `ticket-${Date.now().toString(36)}`,
      userId: principal.userId,
      subject: body.subject,
      messages: [{ role: 'user', content: body.message, timestamp: new Date().toISOString() }],
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    if (deps.db) {
      await deps.db.collection('supportTickets').doc(ticket.id).set(ticket);
    }

    deps.logger.info('support.ticket_created', { userId: principal.userId, ticketId: ticket.id });
    return c.json({ ticket });
  });

  // GET /v1/support/tickets
  app.get('/tickets', async (c) => {
    const principal = requireAuth(c);
    if (!deps.db) return c.json({ tickets: [] });
    const snap = await deps.db.collection('supportTickets').where('userId', '==', principal.userId).limit(20).get();
    const tickets = snap.docs.map(d => d.data()).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return c.json({ tickets });
  });

  return app;
}
