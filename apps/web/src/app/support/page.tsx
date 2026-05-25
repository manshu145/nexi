'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '~/lib/auth-context';
import { api, type ChatMessage } from '~/lib/api';
import { Logo } from '~/components/Logo';

export default function SupportPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hi! I'm Nexi. What issue can I help you with today?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    try {
      const res = await api.sendChat(`support: ${text}`, sessionId ?? undefined);
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

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><span className="spinner" /></main>;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-6 pb-4">
      <header className="flex items-center justify-between">
        <Logo />
        <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm">← Dashboard</button>
      </header>

      <section className="mt-6">
        <h1 className="font-serif text-2xl font-bold text-ink-900 dark:text-paper-50">Support</h1>
        <p className="mt-1 text-sm text-muted-500">Chat with Nexi or contact admin for help.</p>
      </section>

      {/* Chat area */}
      <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-paper-200 dark:border-ink-700 bg-paper-50 dark:bg-ink-800 p-4 space-y-3 min-h-[300px] max-h-[50vh]">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-ember-500 text-paper-50 dark:bg-ember-600' : 'paper-card text-ink-900 dark:text-paper-100'}`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
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

      {/* Input — send button inside input container */}
      <div className="mt-3 relative">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your issue..."
          rows={2}
          className="w-full resize-none rounded-xl border border-paper-300 dark:border-ink-600 bg-paper-50 dark:bg-ink-800 px-4 py-3 pr-12 text-sm text-ink-900 dark:text-paper-50 placeholder:text-muted-500 focus:outline-none focus:ring-2 focus:ring-ember-500 min-h-[44px]"
        />
        <button onClick={sendMessage} disabled={!input.trim() || sending} className="absolute right-3 bottom-3 btn-primary h-8 w-8 rounded-lg p-0 flex items-center justify-center disabled:opacity-50 text-sm" aria-label="Send message">
          ➤
        </button>
      </div>

      {/* Contact Admin — SVG mail icon instead of broken emoji */}
      <div className="mt-6 border-t border-paper-200 dark:border-ink-700 pt-4">
        <button onClick={() => setShowContact(!showContact)} className="btn-ghost w-full text-sm flex items-center justify-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="M22 7l-10 6L2 7"/>
          </svg>
          {showContact ? 'Hide Contact Info' : 'Contact Admin'}
        </button>
        {showContact && (
          <div className="paper-card mt-3 p-4 text-center">
            <p className="text-sm text-ink-700 dark:text-paper-200">For billing or account issues, email:</p>
            <a href="mailto:help@nexigrate.com" className="mt-2 inline-block font-medium text-ember-600 dark:text-gold-500 underline">
              help@nexigrate.com
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
