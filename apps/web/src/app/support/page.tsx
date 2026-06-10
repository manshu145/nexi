'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '~/lib/auth-context';
import { api, type ChatMessage } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';

/**
 * PR-34b (audit #45): the support assistant's system prompt previously
 * hardcoded plan prices (and an OUTDATED Aspirant ₹199 instead of ₹299),
 * which meant the AI happily told users incorrect info on every change to
 * /admin/plans. The page now fetches the live admin-edited plans on mount
 * and rebuilds the system prompt with the correct prices. If the fetch
 * fails the DEFAULT_SUPPORT_PREFIX is used so the page keeps working —
 * we've also corrected the typo there so even the offline path is right.
 *
 * The support session attaches the prefix to the FIRST message of a
 * session only (`!sessionId`), so we don't pay for the prompt repeatedly
 * within the same conversation.
 */
function buildSupportPrefix(priceLine: string): string {
  return `[SYSTEM CONTEXT: You are the official support assistant for Nexigrate (nexigrate.com), an AI-powered study platform for Indian competitive exams (UPSC, JEE, NEET, SSC, Banking). 

Your role: Help users with platform-related issues ONLY.

Platform info you MUST know:
- Nexigrate provides: AI-generated chapters, chapter quizzes, current affairs, AI chat (Nexi), practice sets (essay writing), streak rewards, credit system
- Plans: ${priceLine}
- Credits: Earned by completing chapters (5-50 per chapter), daily streak bonus (10/day), referrals (100 credits each)
- New users start with 200 credits
- Passing chapter quiz (80%+) earns 50 credits, attempting earns 5
- Reading a chapter costs 5 credits (free plan only)
- Mock tests cost 20 credits (free plan only)
- Chapters unlock by passing the previous chapter quiz with 80%+ score
- Contact email: help@nexigrate.com
- Founder: Manshu
- No phone support available currently

Rules:
- ONLY answer questions about Nexigrate platform, billing, account, features, and technical issues
- If user asks study/exam questions, politely redirect them to the main "Nexi AI Chat" feature on dashboard
- If you don't know something specific, say "I'll connect you with our team at help@nexigrate.com"
- Never make up features or policies that don't exist
- Be friendly, concise, and helpful
- Reply in the user's language (Hindi/English based on their message)]\n\n`;
}

const DEFAULT_PRICE_LINE = 'Free (limited chapters, 2 essays/week), Scholar (₹99/mo), Aspirant (₹299/mo), Achiever (₹599/mo)';
const DEFAULT_SUPPORT_PREFIX = buildSupportPrefix(DEFAULT_PRICE_LINE);

export default function SupportPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hi! I'm Nexi Support. I can help you with:\n\n- **Account & billing** issues\n- **Credits & chapter unlock** problems\n- **Plan upgrades** & payment queries\n- **Technical bugs** on the platform\n\nHow can I help you today?", timestamp: new Date().toISOString() },
  ]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showContact, setShowContact] = useState(false);
  // PR-34c (audit #27 + #28): real ticket creation. Pre-PR-34c the only
  // support surface was AI chat — students could not actually reach a
  // human, so /admin/support was forever empty. Backend already had
  // POST /v1/support/ticket; we just had no UI for it.
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [submittingTicket, setSubmittingTicket] = useState(false);
  // PR-34b (audit #45): live plan-aware system prefix. Defaults to the
  // hand-written one (with corrected ₹299 / ₹599) so the page keeps
  // working when /v1/billing/plans is unreachable.
  const [supportPrefix, setSupportPrefix] = useState<string>(DEFAULT_SUPPORT_PREFIX);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Fetch the live plan matrix and rebuild the prompt with the real
  // prices. Failure is silent — DEFAULT_SUPPORT_PREFIX continues to apply.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getPlans();
        if (cancelled) return;
        // Skip free-plan in the price line — it's described separately.
        const paid = r.plans.filter((p) => p.price > 0);
        if (paid.length === 0) return;
        const priceLine = `Free (limited chapters, 2 essays/week), ${paid.map((p) => `${p.name} (₹${p.price}/mo)`).join(', ')}`;
        setSupportPrefix(buildSupportPrefix(priceLine));
      } catch {
        // keep DEFAULT_SUPPORT_PREFIX
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    try {
      // Prefix is attached only on the FIRST message of a session — once
      // the assistant has it in context, repeating it on every follow-up
      // would just burn tokens.
      const prefix = sessionId ? '' : supportPrefix;
      const messageToSend = prefix + text;
      const res = await api.sendChat(messageToSend, sessionId ?? undefined);
      setSessionId(res.sessionId);
      const aiMsg: ChatMessage = { role: 'assistant', content: res.response, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      const errMsg: ChatMessage = { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Failed to send'}`, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  /**
   * PR-34c (audit #27): submit a real support ticket. The server
   * persists into `supportTickets` so admin can reply via the existing
   * /admin/support panel. Client validates: subject + message required,
   * message capped at 1000 chars (the textarea's maxLength enforces it
   * but we also slice in onSubmit defensively).
   */
  const submitTicket = async () => {
    const subject = ticketSubject.trim();
    const message = ticketMessage.trim().slice(0, 1000);
    if (!subject || !message) {
      toast.error('Both subject and description are required');
      return;
    }
    if (submittingTicket) return;
    setSubmittingTicket(true);
    try {
      await api.createSupportTicket(subject, message);
      toast.success('Ticket created — admin will reply soon');
      setTicketSubject('');
      setTicketMessage('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create ticket');
    } finally {
      setSubmittingTicket(false);
    }
  };

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><AILoader context="general" /></main>;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-24">
      <header className="flex items-center justify-between">
        <Logo height={36} />
        <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">← Dashboard</button>
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-2xl font-bold text-ink-900">Support</h1>
        <p className="mt-1 text-sm text-muted-500">Chat with Nexi or contact admin for help.</p>
      </section>

      {/* Chat area */}
      <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-line bg-paper-50 p-4 space-y-3 min-h-[300px] max-h-[50vh]">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-ember-500 text-paper-50' : 'paper-card text-ink-900'}`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm max-w-none"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="paper-card max-w-[85%] rounded-2xl px-4 py-3">
              <span className="inline-flex gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-500 animate-bounce" />
                <span className="h-2 w-2 rounded-full bg-muted-500 animate-bounce [animation-delay:0.15s]" />
                <span className="h-2 w-2 rounded-full bg-muted-500 animate-bounce [animation-delay:0.3s]" />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick help buttons */}
      {messages.length <= 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {['Credits not updating', 'Next chapter locked', 'Payment failed', 'How to upgrade plan?', 'Account delete'].map(q => (
            <button key={q} onClick={() => setInput(q)} className="pill text-xs hover:bg-paper-300 transition-colors">{q}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="mt-3 relative">
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Describe your issue..." rows={2} className="input w-full resize-none pr-12 min-h-[44px]" />
        <button onClick={sendMessage} disabled={!input.trim() || sending} className="absolute right-3 bottom-3 btn-primary h-8 w-8 rounded-lg p-0 flex items-center justify-center disabled:opacity-50 text-sm" aria-label="Send message">➤</button>
      </div>

      {/* PR-34c (audit #27): Real human ticket form. Sits below the AI
          chat so AI is the first port of call (free, instant), but
          students always have an escape hatch to a tracked ticket the
          admin actually receives. */}
      <section className="mt-8 border-t border-line pt-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Need human help? Create a ticket</h2>
        <p className="mt-1 text-xs text-muted-500">Admin will reply on /profile/tickets — typically within 24 hours.</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-500">Subject</label>
            <input
              type="text"
              value={ticketSubject}
              onChange={(e) => setTicketSubject(e.target.value.slice(0, 120))}
              placeholder="Brief summary (e.g. Payment didn't unlock plan)"
              className="input w-full text-sm"
              maxLength={120}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-500">Describe your issue</label>
            <textarea
              value={ticketMessage}
              onChange={(e) => setTicketMessage(e.target.value.slice(0, 1000))}
              rows={4}
              placeholder="What were you trying to do? What happened? What did you expect?"
              className="input w-full resize-none text-sm"
              maxLength={1000}
            />
            <p className="mt-1 text-right text-[10px] text-muted-400">{ticketMessage.length}/1000</p>
          </div>
          <button
            type="button"
            onClick={submitTicket}
            disabled={submittingTicket || !ticketSubject.trim() || !ticketMessage.trim()}
            className="btn-primary w-full text-sm disabled:opacity-50"
          >
            {submittingTicket ? 'Submitting…' : 'Create ticket'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/profile/tickets')}
            className="btn-ghost w-full text-xs"
          >
            View my tickets →
          </button>
        </div>
      </section>

      {/* Contact Admin */}
      <div className="mt-6 border-t border-line pt-4">
        <button onClick={() => setShowContact(!showContact)} className="btn-ghost w-full text-sm flex items-center justify-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>
          {showContact ? 'Hide Contact Info' : 'Contact Admin'}
        </button>
        {showContact && (
          <div className="paper-card mt-3 p-4 text-center">
            <p className="text-sm text-ink-700">For billing or account issues, email:</p>
            <a href="mailto:help@nexigrate.com" className="mt-2 inline-block font-medium text-ember-600 underline">help@nexigrate.com</a>
          </div>
        )}
      </div>
    </main>
  );
}
