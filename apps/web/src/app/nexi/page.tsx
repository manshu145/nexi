'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';
import { useTranslation } from '~/lib/useTranslation';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function NexiChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { t, lang } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const SUGGESTIONS = lang === 'hi'
    ? [
        'भारतीय संविधान समझाएं',
        'न्यूटन के गति के नियम क्या हैं?',
        'UPSC की तैयारी के टिप्स',
        'प्रकाश संश्लेषण सरल भाषा में',
        'इस हफ्ते के करंट अफेयर्स',
        'द्विघात समीकरण कैसे हल करें?',
      ]
    : [
        'Explain the Indian Constitution',
        "What are Newton's laws of motion?",
        'Tips for UPSC preparation',
        'Explain photosynthesis simply',
        'Current affairs summary for this week',
        'How to solve quadratic equations?',
      ];

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
      // Try backend first
      const res = await api.ai.getChatHistory();
      if (res.messages && res.messages.length > 0) {
        setMessages(res.messages as ChatMessage[]);
        // Backup to localStorage
        localStorage.setItem('nexi.chat.history', JSON.stringify(res.messages));
      } else {
        // Fallback to localStorage
        const cached = localStorage.getItem('nexi.chat.history');
        if (cached) setMessages(JSON.parse(cached) as ChatMessage[]);
      }
    } catch {
      // Fallback to localStorage if backend fails
      const cached = localStorage.getItem('nexi.chat.history');
      if (cached) setMessages(JSON.parse(cached) as ChatMessage[]);
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
    setMessages((prev) => {
      const updated = [...prev, userMsg];
      localStorage.setItem('nexi.chat.history', JSON.stringify(updated.slice(-100)));
      return updated;
    });
    setInput('');
    setSending(true);

    try {
      const res = await api.ai.chat(message);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: res.reply,
        timestamp: res.timestamp ?? new Date().toISOString(),
      };
      setMessages((prev) => {
        const updated = [...prev, assistantMsg];
        localStorage.setItem('nexi.chat.history', JSON.stringify(updated.slice(-100)));
        return updated;
      });
    } catch {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: t('nexi.error_response', "Sorry, I couldn't process that. Please try again."),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function handleClearHistory() {
    if (!confirm(t('nexi.clear_confirm', 'Clear all chat history?'))) return;
    try {
      await api.ai.clearChatHistory();
      setMessages([]);
      localStorage.removeItem('nexi.chat.history');
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

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  if (loading || loadingHistory) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper-100">
        <div className="flex flex-col items-center gap-3">
          <span className="spinner" />
          <span className="text-sm text-muted-500">{t('loading', 'Loading...')}</span>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col bg-paper-50 overflow-hidden">
      {/* ═══ Header ═══ */}
      <header className="shrink-0 border-b border-paper-200 bg-paper-100/80 backdrop-blur-md px-4 py-3 z-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex h-8 w-8 items-center justify-center rounded-full bg-paper-200 text-ink-800 hover:bg-paper-300 transition">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-sm font-bold text-ink-900 flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-[10px] text-white">AI</span>
                {t('nexi.title', 'Nexi AI')}
              </h1>
              <p className="text-[11px] text-muted-500">{t('nexi.subtitle', 'Your study assistant')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {messages.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="text-[11px] text-muted-500 hover:text-red-600 transition font-medium"
                title="Clear history"
              >
                {t('nexi.clear', 'Clear')}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ═══ Messages area ═══ */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-100 to-blue-100 shadow-sm">
                <span className="text-3xl">🤖</span>
              </div>
              <h2 className="font-serif text-xl font-bold text-ink-900 mt-5">
                {t('nexi.empty_title', "Hi! I'm Nexi")}
              </h2>
              <p className="mt-2 text-sm text-muted-500 max-w-sm leading-relaxed">
                {t('nexi.empty_desc', 'Your AI study assistant. Ask me anything about your subjects, exam preparation, doubt clearing, or study strategies.')}
              </p>

              {/* Suggestion chips */}
              <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="rounded-xl border border-paper-300 bg-paper-100 px-3.5 py-2 text-xs text-ink-700 hover:border-ember-300 hover:bg-paper-200 hover:text-ember-700 transition-all duration-200 shadow-sm hover:shadow"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex mb-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {/* Assistant avatar */}
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 mr-2 mt-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500 shadow-sm">
                    <span className="text-[10px] text-white font-bold">AI</span>
                  </div>
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-ember-500 text-white rounded-br-md'
                    : 'bg-paper-200 text-ink-800 rounded-bl-md border border-paper-300'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose-nexi">{renderMarkdown(msg.content)}</div>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {sending && (
            <div className="flex mb-4 justify-start">
              <div className="flex-shrink-0 mr-2 mt-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500">
                  <span className="text-[10px] text-white font-bold">AI</span>
                </div>
              </div>
              <div className="rounded-2xl rounded-bl-md bg-paper-200 border border-paper-300 px-4 py-3 shadow-sm">
                <div className="flex gap-1.5 items-center">
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

      {/* ═══ Input area ═══ */}
      <div className="shrink-0 border-t border-paper-200 bg-paper-100/80 backdrop-blur-md px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t('nexi.input_placeholder', 'Ask anything...')}
              rows={1}
              className="w-full resize-none rounded-xl border border-paper-300 bg-paper-50 px-4 py-3 pr-12 text-sm text-ink-900 placeholder-muted-400 focus:border-ember-400 focus:outline-none focus:ring-2 focus:ring-ember-100 transition-all"
              style={{ maxHeight: '120px' }}
              disabled={sending}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || sending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ember-500 text-white shadow-md hover:bg-ember-600 hover:shadow-lg disabled:opacity-40 disabled:hover:shadow-md transition-all duration-200 active:scale-95"
            aria-label="Send"
          >
            <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3 21l18-9L3 3l3 9zm0 0h6" />
            </svg>
          </button>
        </div>
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Markdown renderer — simple but covers all common AI output patterns
// ═══════════════════════════════════════════════════════════════════════════════

function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Code block toggle
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        inCodeBlock = false;
        elements.push(
          <pre key={`code-${i}`} className="my-2 overflow-x-auto rounded-lg bg-ink-900 p-3 text-xs text-paper-200">
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="font-bold text-ink-900 mt-3 mb-1">{line.slice(4)}</h4>);
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="font-bold text-ink-900 mt-3 mb-1 text-base">{line.slice(3)}</h3>);
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="font-bold text-ink-900 mt-3 mb-1 text-lg">{line.slice(2)}</h2>);
      continue;
    }

    // Bullet lists
    if (line.match(/^[-*]\s/)) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-ink-800 leading-relaxed">
          {renderInline(line.slice(2))}
        </li>
      );
      continue;
    }

    // Numbered lists
    if (line.match(/^\d+\.\s/)) {
      elements.push(
        <li key={i} className="ml-4 list-decimal text-ink-800 leading-relaxed">
          {renderInline(line.replace(/^\d+\.\s/, ''))}
        </li>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-ink-800 leading-relaxed">
        {renderInline(line)}
      </p>
    );
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  // Process bold, italic, inline code
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/\*\*(.*?)\*\*/);
    // Inline code: `text`
    const codeMatch = remaining.match(/`(.*?)`/);

    // Find earliest match
    let earliest = remaining.length;
    let matchType: 'bold' | 'code' | 'none' = 'none';
    let match: RegExpMatchArray | null = null;

    if (boldMatch && boldMatch.index !== undefined && boldMatch.index < earliest) {
      earliest = boldMatch.index;
      matchType = 'bold';
      match = boldMatch;
    }
    if (codeMatch && codeMatch.index !== undefined && codeMatch.index < earliest) {
      earliest = codeMatch.index;
      matchType = 'code';
      match = codeMatch;
    }

    if (matchType === 'none' || !match) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    // Text before the match
    if (earliest > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, earliest)}</span>);
    }

    if (matchType === 'bold') {
      parts.push(<strong key={key++} className="font-semibold">{match[1]}</strong>);
    } else if (matchType === 'code') {
      parts.push(
        <code key={key++} className="rounded bg-paper-300 px-1.5 py-0.5 text-xs font-mono text-ember-700">
          {match[1]}
        </code>
      );
    }

    remaining = remaining.slice(earliest + match[0].length);
  }

  return <>{parts}</>;
}
