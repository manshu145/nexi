/**
 * Admin mailbox — two-way email conversations.
 *
 *   GET   /v1/mailbox/threads            — list threads (+ unread count)
 *   GET   /v1/mailbox/threads/:id        — thread + messages (marks read)
 *   POST  /v1/mailbox/threads/:id/reply  — send a reply (appends outbound)
 *   POST  /v1/mailbox/threads/:id/status — open/close a thread
 *   POST  /v1/mailbox/compose            — start a new conversation
 *
 * Admin-only (same guard as the /v1/admin router). Inbound replies arrive
 * via the Resend Inbound webhook (see app.ts) and get appended to threads.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';
import type { UserStore } from '../lib/userStore.js';
import type { Env } from '../env.js';
import type { ServiceKeyStore } from '../lib/serviceKeyStore.js';
import type { EmailThreadStore } from '../lib/emailThreadStore.js';
import { createEmailService } from '../lib/emailService.js';
import { isHardcodedSuperAdmin } from '../lib/adminEmails.js';

export interface MailboxRoutesDeps {
  threads: EmailThreadStore;
  users: UserStore;
  env: Env;
  logger: Logger;
  serviceKeys?: ServiceKeyStore;
}

/** Minimal branded HTML wrapper for plain-text admin replies. */
function wrapReply(text: string): string {
  const safe = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#FAF7F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><div style="max-width:600px;margin:0 auto;padding:24px"><div style="background:#fff;padding:24px;border-radius:12px;border:1px solid #E7E5E4;font-size:15px;line-height:1.6;color:#44403C">${safe}</div><div style="text-align:center;padding:16px 0;color:#A8A29E;font-size:11px">Nexigrate Support · reply to this email to continue the conversation</div></div></body></html>`;
}

/** Build the per-thread reply-to address: support+<threadId>@domain. */
function threadReplyTo(env: Env, threadId: string): string {
  const base = env.MAILBOX_INBOUND_ADDRESS || 'support@nexigrate.com';
  const at = base.indexOf('@');
  if (at < 0) return base;
  return `${base.slice(0, at)}+${threadId}${base.slice(at)}`;
}

export function makeMailboxRoutes(deps: MailboxRoutesDeps): Hono {
  const app = new Hono();

  // Admin guard (mirrors the /v1/admin router check).
  async function requireAdmin(c: Context) {
    const principal = requireAuth(c);
    const user = await deps.users.get(principal.userId);
    const email = principal.email ?? user?.email ?? '';
    const ok = isHardcodedSuperAdmin(email)
      || email.toLowerCase() === deps.env.SUPER_ADMIN_EMAIL.toLowerCase()
      || user?.role === 'admin';
    if (!ok) throw new HTTPException(403, { message: 'Admin access required' });
    return { principal, email };
  }

  app.get('/threads', async (c) => {
    await requireAdmin(c);
    const status = c.req.query('status');
    const [threads, unreadCount] = await Promise.all([
      deps.threads.listThreads({ status: status === 'open' || status === 'closed' ? status : undefined, limit: 60 }),
      deps.threads.unreadCount(),
    ]);
    return c.json({ threads, unreadCount });
  });

  app.get('/threads/:id', async (c) => {
    await requireAdmin(c);
    const res = await deps.threads.getThread(c.req.param('id'));
    if (!res) throw new HTTPException(404, { message: 'Thread not found' });
    await deps.threads.markRead(res.thread.id); // opening = read
    return c.json(res);
  });

  const replySchema = z.object({ text: z.string().min(1).max(10000) });
  app.post('/threads/:id/reply', async (c) => {
    const { email } = await requireAdmin(c);
    const id = c.req.param('id');
    const data = await deps.threads.getThread(id);
    if (!data) throw new HTTPException(404, { message: 'Thread not found' });
    const body = await c.req.json().catch(() => null);
    const parsed = replySchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });

    const emailService = createEmailService(deps.env, deps.logger, deps.serviceKeys);
    const subject = data.thread.subject.startsWith('Re:') ? data.thread.subject : `Re: ${data.thread.subject}`;
    // Thread on the most recent inbound message id when present.
    const lastInbound = [...data.messages].reverse().find(m => m.direction === 'inbound' && m.messageId);
    const sent = await emailService.sendThreaded(data.thread.participantEmail, subject, wrapReply(parsed.data.text), {
      replyTo: threadReplyTo(deps.env, id),
      ...(lastInbound?.messageId ? { inReplyTo: lastInbound.messageId } : {}),
    });
    if (!sent.success) throw new HTTPException(502, { message: 'Email failed to send (check Resend config)' });

    const msg = await deps.threads.appendMessage(id, {
      direction: 'outbound',
      from: deps.env.MAILBOX_INBOUND_ADDRESS || 'support@nexigrate.com',
      to: data.thread.participantEmail,
      subject,
      text: parsed.data.text,
      status: 'sent',
      authorAdminEmail: email,
      ...(sent.id ? { messageId: sent.id } : {}),
    });
    deps.logger.info('mailbox.reply_sent', { threadId: id, to: data.thread.participantEmail, by: email });
    return c.json({ message: msg });
  });

  const statusSchema = z.object({ status: z.enum(['open', 'closed']) });
  app.post('/threads/:id/status', async (c) => {
    await requireAdmin(c);
    const body = await c.req.json().catch(() => null);
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: 'invalid status' });
    await deps.threads.setStatus(c.req.param('id'), parsed.data.status);
    return c.json({ success: true });
  });

  const composeSchema = z.object({
    to: z.string().email(),
    name: z.string().max(120).optional(),
    subject: z.string().min(1).max(200),
    text: z.string().min(1).max(10000),
  });
  app.post('/compose', async (c) => {
    const { email } = await requireAdmin(c);
    const body = await c.req.json().catch(() => null);
    const parsed = composeSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? 'invalid body' });

    const thread = await deps.threads.createThread({
      participantEmail: parsed.data.to,
      ...(parsed.data.name ? { participantName: parsed.data.name } : {}),
      subject: parsed.data.subject,
    });
    const emailService = createEmailService(deps.env, deps.logger, deps.serviceKeys);
    const sent = await emailService.sendThreaded(parsed.data.to, parsed.data.subject, wrapReply(parsed.data.text), {
      replyTo: threadReplyTo(deps.env, thread.id),
    });
    if (!sent.success) throw new HTTPException(502, { message: 'Email failed to send (check Resend config)' });

    await deps.threads.appendMessage(thread.id, {
      direction: 'outbound',
      from: deps.env.MAILBOX_INBOUND_ADDRESS || 'support@nexigrate.com',
      to: parsed.data.to,
      subject: parsed.data.subject,
      text: parsed.data.text,
      status: 'sent',
      authorAdminEmail: email,
      ...(sent.id ? { messageId: sent.id } : {}),
    });
    deps.logger.info('mailbox.compose_sent', { threadId: thread.id, to: parsed.data.to, by: email });
    return c.json({ thread });
  });

  return app;
}
