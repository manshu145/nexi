'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  escalated?: boolean;
}

export default function HelpPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    // Load chat history
    api.chat.history().then((res) => {
      setMessages(res.messages.map((m: { role: string; content: string; timestamp: string }) => ({
        ...m,
        role: m.role as 'user' | 'assistant',
      })));
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput('');
    setSending(true);

    // Optimistic add
    const userMsg: Message = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await api.chat.message(msg);
      const aiMsg: Message = {
        role: 'assistant',
        content: res.response,
        timestamp: res.timestamp,
        escalated: res.escalated,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Sorry, I\'m having trouble connecting. Please try again.',
        timestamp: new Date().toISOString(),
      }]);
    }
    setSending(false);
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="spinner" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pt-6 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-sm font-semibold text-ink-900">Nexi Support</h1>
            <p className="text-xs text-muted-500">AI-powered help</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost-sm" onClick={() => router.push('/support')}>
            Tickets
          </button>
          <button className="btn-ghost-sm" onClick={() => router.push('/dashboard')}>
            Dashboard
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4 min-h-0">
        {messages.length === 0 && (
          <div className="paper-card p-6 text-center mt-8">
            <p className="text-2xl mb-2">👋</p>
            <h2 className="font-serif text-lg font-semibold text-ink-900">Hi! I&apos;m Nexi</h2>
            <p className="mt-2 text-sm text-muted-500">
              Your AI study assistant. Ask me anything about the platform, credits, exams, or study tips.
              If I can&apos;t help, I&apos;ll connect you to our support team.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {['How do credits work?', 'Help with my subscription', 'Study tips for UPSC', 'Talk to a human'].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="pill cursor-pointer hover:border-ember-500 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-ink-900 text-paper-100 rounded-br-sm'
                  : 'paper-card rounded-bl-sm'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.escalated && (
                <div className="mt-2 pt-2 border-t border-line">
                  <button
                    className="text-xs font-medium text-ember-500 hover:text-ember-600"
                    onClick={() => router.push('/support')}
                  >
                    → View support tickets
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="paper-card rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="spinner" />
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="border-t border-line pt-3">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <input
            type="text"
            className="input flex-1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Nexi anything..."
            disabled={sending}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={!input.trim() || sending}
          >
            Send
          </button>
        </form>
      </div>
    </main>
  );
}
