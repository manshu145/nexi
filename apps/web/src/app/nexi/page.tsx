'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api } from '~/lib/api';

/**
 * Nexi AI — ChatGPT-style study assistant.
 * Full chat history, markdown rendering, data visualization support.
 */

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export default function NexiPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/signin');
  }, [user, loading, router]);

  // Load chat history
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { messages: history } = await api.ai.getChatHistory();
        setMessages(history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
      } catch {
        // Start fresh
      } finally {
        setHistoryLoaded(true);
      }
    })();
  }, [user]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    const userMsg: Message = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    try {
      const { reply } = await api.ai.chat(text);
      const assistantMsg: Message = { role: 'assistant', content: reply, timestamp: Date.now() };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      const errorMsg: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function clearHistory() {
    if (!confirm('Clear all chat history?')) return;
    try {
      await api.ai.clearChatHistory();
      setMessages([]);
    } catch { /* ignore */ }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (loading || !user) {
    return (
      <main className="nexi-loading">
        <span className="spinner" /> Loading Nexi…
      </main>
    );
  }

  return (
    <main className="nexi-page">
      {/* Header */}
      <header className="nexi-header">
        <button className="btn-back" onClick={() => router.push('/dashboard')}>←</button>
        <div className="nexi-header-title">
          <h1>🤖 Nexi AI</h1>
          <span className="nexi-subtitle">Your personal study assistant</span>
        </div>
        <button className="btn-ghost-sm" onClick={clearHistory} title="Clear history">
          🗑️
        </button>
      </header>

      {/* Messages */}
      <section className="nexi-messages">
        {messages.length === 0 && historyLoaded && (
          <div className="nexi-welcome">
            <div className="nexi-avatar-large">🤖</div>
            <h2>Hi! I&apos;m Nexi</h2>
            <p>Your AI-powered study buddy. Ask me anything about your exam preparation:</p>
            <div className="nexi-suggestions">
              <button onClick={() => { setInput('Explain Newton\'s Laws of Motion'); inputRef.current?.focus(); }}>
                Explain Newton&apos;s Laws
              </button>
              <button onClick={() => { setInput('Solve: If x² + 5x + 6 = 0, find x'); inputRef.current?.focus(); }}>
                Solve a math problem
              </button>
              <button onClick={() => { setInput('What are the important dates in Indian history?'); inputRef.current?.focus(); }}>
                Important history dates
              </button>
              <button onClick={() => { setInput('Give me tips for time management in exams'); inputRef.current?.focus(); }}>
                Exam tips
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`nexi-msg ${msg.role}`}>
            <div className="nexi-msg-avatar">
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="nexi-msg-content">
              {msg.role === 'assistant' ? (
                <div className="nexi-msg-text" dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
              ) : (
                <div className="nexi-msg-text">{msg.content}</div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="nexi-msg assistant">
            <div className="nexi-msg-avatar">🤖</div>
            <div className="nexi-msg-content">
              <div className="nexi-typing">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </section>

      {/* Input */}
      <footer className="nexi-input-area">
        <div className="nexi-input-wrapper">
          <textarea
            ref={inputRef}
            className="nexi-input"
            placeholder="Ask Nexi anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={sending}
          />
          <button
            className="nexi-send-btn"
            onClick={sendMessage}
            disabled={!input.trim() || sending}
          >
            ↑
          </button>
        </div>
      </footer>
    </main>
  );
}

function formatMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^### (.*$)/gm, '<h4>$1</h4>')
    .replace(/^## (.*$)/gm, '<h3>$1</h3>')
    .replace(/^# (.*$)/gm, '<h2>$1</h2>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}
