'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '~/components/Logo';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const SUGGESTIONS = [
  'Explain the Indian Constitution',
  'What are Newton\'s laws of motion?',
  'Tips for UPSC preparation',
  'Explain photosynthesis simply',
  'Current affairs summary for this week',
  'How to solve quadratic equations?',
];

export default function NexiChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    loadHistory();
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadHistory() {
    try {
      setLoadingHistory(true);
      const res = await api.ai.getChatHistory();
      setMessages(res.messages as ChatMessage[]);
    } catch {
      // Start fresh if history fails
    } finally {
      setLoadingHistory(false);
    }
  }

  async function sendMessage(text?: string) {
    const message = text ?? input.trim();
    if (!message || sending) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await api.ai.chat(message);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.reply,
        timestamp: res.timestamp ?? new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I couldn\'t process that. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function handleClearHistory() {
    if (!confirm('Clear all chat history?')) return;
    try {
      await api.ai.clearChatHistory();
      setMessages([]);
    } catch {
      // ignore
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function renderContent(content: string) {
    // Simple markdown rendering: bold, italic, code blocks, lists
    return content.split('\n').map((line, i) => {
      if (line.startsWith('```')) return null;
      if (line.startsWith('# ')) return <h3 key={i} className="font-bold mt-2">{line.slice(2)}</h3>;
      if (line.startsWith('## ')) return <h4 key={i} className="font-semibold mt-2">{line.slice(3)}</h4>;
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={i} className="ml-4 list-disc">{line.slice(2)}</li>;
      }
      if (line.match(/^\d+\. /)) {
        return <li key={i} className="ml-4 list-decimal">{line.replace(/^\d+\. /, '')}</li>;
      }
      // Bold: **text**
      const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code class="bg-paper-200 px-1 rounded text-xs">$1</code>');
      return <p key={i} className="mt-1" dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
  }

  if (loading || loadingHistory) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="spinner" aria-hidden="true" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-paper-200 bg-paper-50 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="ml-2">
              <h1 className="text-sm font-semibold text-ink-900">Nexi AI</h1>
              <p className="text-xs text-muted-500">Your study assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearHistory}
              className="text-xs text-muted-500 hover:text-red-600"
              title="Clear history"
            >
              Clear
            </button>
            <Link href="/dashboard" className="text-xs text-ember-600 hover:underline">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 && (
            <div className="py-12 text-center">
              <div className="text-4xl mb-4">&#x1F4DA;</div>
              <h2 className="font-serif text-xl font-semibold text-ink-900">
                Hi! I&apos;m Nexi
              </h2>
              <p className="mt-2 text-sm text-muted-500 max-w-md mx-auto">
                Your AI study assistant. Ask me anything about your subjects,
                exam preparation, doubt clearing, or study strategies.
              </p>

              {/* Suggestions */}
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="rounded-full border border-paper-300 px-3 py-1.5 text-xs text-ink-700 hover:border-ember-300 hover:text-ember-700 transition-colors"
                  >
                    {s}
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
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-ember-500 text-white rounded-br-md'
                    : 'bg-paper-200 text-ink-800 rounded-bl-md'
                }`}
              >
                <div className="leading-relaxed">
                  {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-paper-200 px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 rounded-full bg-muted-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 rounded-full bg-muted-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="sticky bottom-0 border-t border-paper-200 bg-paper-50 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            className="input flex-1 resize-none py-2.5"
            disabled={sending}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || sending}
            className="btn-primary h-10 w-10 flex items-center justify-center rounded-full p-0 disabled:opacity-40"
            aria-label="Send"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
    </main>
  );
}
