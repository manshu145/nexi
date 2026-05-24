'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '~/components/Logo';
import { MobileNav } from '~/components/MobileNav';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * /nexipedia → Nexi AI Chatbot
 *
 * A full-screen ChatGPT-like study assistant. Students can:
 * - Ask any academic question
 * - Get explanations with examples
 * - Request diagrams/visualizations
 * - Get study tips personalized to their exam
 *
 * No manual input for content — this IS the encyclopedia, but interactive.
 */

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export default function NexiChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nexi.chat.history');
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem('nexi.chat.history', JSON.stringify(messages.slice(-50)));
      } catch {}
    }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  async function onSend() {
    if (!input.trim() || sending) return;
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await api.ai.chat(userMsg.content);
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.reply,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      const errorMsg: Message = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I couldn\'t respond. Please check your internet connection and try again.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function clearHistory() {
    setMessages([]);
    localStorage.removeItem('nexi.chat.history');
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="spinner" />
      </main>
    );
  }

  return (
    <>
      <main className="flex min-h-screen flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-paper-50/95 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ember-600 text-xs text-paper-100 font-bold">N</span>
              <span className="font-serif text-sm font-semibold text-ink-900">Nexi</span>
              <span className="pill text-[9px]">AI</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button type="button" onClick={clearHistory} className="btn-ghost-sm text-xs">
                Clear
              </button>
            )}
            <button type="button" onClick={() => router.push('/dashboard')} className="btn-ghost-sm">
              Dashboard
            </button>
          </div>
        </header>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 pb-32">
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.length === 0 && (
              <div className="mt-16 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-paper-200">
                  <span className="text-3xl">🧠</span>
                </div>
                <h1 className="font-serif mt-4 text-2xl font-semibold text-ink-900">
                  Hi! I&apos;m Nexi
                </h1>
                <p className="mt-2 text-sm text-ink-800 max-w-sm mx-auto">
                  Your AI study buddy. Ask me anything — explain concepts, solve problems,
                  create summaries, quiz you, or just chat about your studies.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-2 max-w-md mx-auto">
                  {[
                    'Explain photosynthesis simply',
                    'Solve: derivative of x²+3x',
                    'Summarize Indian Constitution Art 14-18',
                    'Quiz me on Newton\'s Laws',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                      className="paper-card p-3 text-left text-xs text-ink-800 hover:bg-paper-200/60 transition"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-ink-900 text-paper-100 rounded-br-md'
                      : 'bg-paper-200 text-ink-900 rounded-bl-md'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-paper-200 px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-muted-500 animate-pulse" />
                    <span className="h-2 w-2 rounded-full bg-muted-500 animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <span className="h-2 w-2 rounded-full bg-muted-500 animate-pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input bar — fixed at bottom */}
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-paper-50/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:pb-3">
          <div className="mx-auto flex max-w-2xl gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
              placeholder="Ask Nexi anything about your studies..."
              className="flex-1 rounded-full border border-line bg-paper-100 px-4 py-2.5 text-sm text-ink-900 placeholder:text-muted-400 focus:outline-none focus:ring-2 focus:ring-ember-600"
              disabled={sending}
            />
            <button
              type="button"
              onClick={onSend}
              disabled={!input.trim() || sending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-900 text-paper-100 transition hover:bg-ember-600 disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
