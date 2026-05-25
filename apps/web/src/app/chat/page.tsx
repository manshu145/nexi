'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '~/lib/auth-context';
import { api, type ChatSessionSummary, type ChatMessage } from '~/lib/api';
import { Logo } from '~/components/Logo';

export default function ChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    api.getChatHistory().then(r => setSessions(r.sessions)).catch(() => {});
  }, [user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadSession = async (id: string) => {
    setActiveSessionId(id);
    setSidebarOpen(false);
    try {
      const res = await api.getChatSession(id);
      setMessages(res.session.messages);
    } catch { setMessages([]); }
  };

  const startNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setInput('');
    setSidebarOpen(false);
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    try {
      const res = await api.sendChat(text, activeSessionId ?? undefined);
      setActiveSessionId(res.sessionId);
      const aiMsg: ChatMessage = { role: 'assistant', content: res.response, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
      setSessions(prev => {
        const exists = prev.find(s => s.id === res.sessionId);
        if (exists) return prev;
        return [{ id: res.sessionId, title: res.title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 2 }, ...prev];
      });
    } catch (e) {
      const errMsg: ChatMessage = { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Failed to send'}`, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, errMsg]);
    } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const prompts = ['Explain Article 370 in simple terms', 'What is the current fiscal deficit?', 'Compare parliamentary vs presidential systems'];

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><span className="spinner" /></main>;

  return (
    <div className="flex h-dvh overflow-hidden bg-paper-50 dark:bg-ink-900">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-paper-200 bg-paper-100 dark:border-ink-700 dark:bg-ink-800 transition-transform md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-paper-200 dark:border-ink-700">
          <Logo />
          <button onClick={() => setSidebarOpen(false)} className="btn-ghost-sm md:hidden">✕</button>
        </div>
        <button onClick={startNewChat} className="btn-primary mx-3 mt-3">+ New Chat</button>
        <nav className="mt-3 flex-1 overflow-y-auto px-3 space-y-1">
          {sessions.map(s => (
            <button key={s.id} onClick={() => loadSession(s.id)} className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${s.id === activeSessionId ? 'bg-paper-300 dark:bg-ink-600 font-medium text-ink-900 dark:text-paper-50' : 'text-ink-700 dark:text-paper-200 hover:bg-paper-200 dark:hover:bg-ink-700'}`}>
              {s.title}
            </button>
          ))}
        </nav>
        <div className="border-t border-paper-200 dark:border-ink-700 p-3">
          <button onClick={() => router.push('/dashboard')} className="btn-ghost w-full text-sm">← Dashboard</button>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 border-b border-paper-200 dark:border-ink-700 px-4 py-3">
          <button onClick={() => setSidebarOpen(true)} className="btn-ghost-sm md:hidden">☰</button>
          <h1 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 truncate">Nexi AI</h1>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <span className="text-5xl">🤖</span>
              <h2 className="font-serif mt-4 text-xl font-bold text-ink-900 dark:text-paper-50">Start a conversation with Nexi AI</h2>
              <p className="mt-2 text-sm text-muted-500">Ask about any topic — UPSC, current affairs, concepts, or exam strategy.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {prompts.map(p => (
                  <button key={p} onClick={() => { setInput(p); }} className="pill text-xs hover:bg-paper-300 dark:hover:bg-ink-600 transition-colors">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-amber-500 text-white dark:bg-amber-600' : 'paper-card text-ink-900 dark:text-paper-100'}`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
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

        {/* Input area */}
        <div className="border-t border-paper-200 dark:border-ink-700 p-4">
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-paper-300 dark:border-ink-600 bg-paper-50 dark:bg-ink-800 px-4 py-3 text-sm text-ink-900 dark:text-paper-50 placeholder:text-muted-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button onClick={sendMessage} disabled={!input.trim() || sending} className="btn-primary h-11 w-11 flex-shrink-0 rounded-xl p-0 flex items-center justify-center disabled:opacity-50">
              ➤
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
