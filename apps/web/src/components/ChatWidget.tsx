'use client';

import { useRef, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { getLang, t } from '~/lib/i18n';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatWidget() {
  const pathname = usePathname();
  const { user } = useAuth();
  const lang = getLang();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Don't show on signin, onboarding, admin pages
  if (!user || pathname.startsWith('/signin') || pathname.startsWith('/onboarding') || pathname.startsWith('/admin')) {
    return null;
  }

  async function onSend() {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setSending(true);
    try {
      const { reply } = await api.chatWithMentor(msg);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, please try again.' }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-ink-900 text-paper-100 shadow-lg transition hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6 sm:h-14 sm:w-14"
          aria-label="Open AI Mentor"
        >
          <span className="text-xl">💬</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-0 right-0 z-50 flex h-[70vh] w-full flex-col border-t border-line bg-paper-50 shadow-2xl sm:bottom-6 sm:right-6 sm:h-[500px] sm:w-[380px] sm:rounded-xl sm:border">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="font-serif text-sm font-semibold text-ink-900">{t('chat.title', lang)}</h3>
            <button type="button" onClick={() => setOpen(false)} className="text-muted-500 hover:text-ink-900">
              ✕
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-sm text-muted-500 mt-8">
                {lang === 'hi' ? 'नमस्ते! मैं आपका AI मेंटर हूं।' : 'Hi! I\'m your AI study mentor.'}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-ink-900 text-paper-100'
                    : 'bg-paper-200 text-ink-900'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-paper-200 px-3 py-2">
                  <span className="spinner" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-line p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onSend()}
                placeholder={t('chat.placeholder', lang)}
                className="flex-1 rounded-full border border-line bg-paper-100 px-4 py-2 text-sm text-ink-900 placeholder:text-muted-400 focus:outline-none focus:ring-2 focus:ring-ember-600"
              />
              <button
                type="button"
                onClick={onSend}
                disabled={!input.trim() || sending}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-900 text-paper-100 disabled:opacity-50"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
