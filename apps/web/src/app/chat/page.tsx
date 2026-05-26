'use client';
import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { useAuth } from '~/lib/auth-context';
import { api, type ChatSessionSummary, type ChatMessage } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';

export default function ChatPageWrapper() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center"><AILoader context="chat" /></div>}>
      <ChatPage />
    </Suspense>
  );
}

interface Attachment {
  type: 'image' | 'file';
  name: string;
  data: string; // base64 data URL
  mimeType: string;
  preview?: string; // for images: object URL for preview
}

function ChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [vizContent, setVizContent] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [copyToast, setCopyToast] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const topicHandled = useRef(false);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    api.getChatHistory().then(r => setSessions(r.sessions)).catch(() => {});
  }, [user]);

  // Handle ?topic= parameter from Current Affairs "Ask Nexi" button
  useEffect(() => {
    if (!user || topicHandled.current || sending) return;
    const topic = searchParams.get('topic');
    if (!topic) return;
    topicHandled.current = true;
    const contextMessage = `I just read this Current Affairs news: "${topic}"\n\nPlease help me understand:\n1. What are the key facts and why is this important?\n2. Which competitive exams (UPSC, SSC, Banking etc.) could ask questions about this?\n3. What type of questions might come from this topic? Give 2-3 sample MCQs.\n4. Are there any related topics I should study alongside this?`;
    const sendContextMessage = async () => {
      setSending(true);
      const userMsg: ChatMessage = { role: 'user', content: contextMessage, timestamp: new Date().toISOString() };
      setMessages([userMsg]);
      try {
        const res = await api.sendChat(contextMessage, undefined);
        setActiveSessionId(res.sessionId);
        const aiMsg: ChatMessage = { role: 'assistant', content: res.response, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, aiMsg]);
        setSessions(prev => [{ id: res.sessionId, title: res.title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 2 }, ...prev]);
      } catch (e) {
        const errMsg: ChatMessage = { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Failed to send'}`, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, errMsg]);
      } finally { setSending(false); }
    };
    sendContextMessage();
    window.history.replaceState({}, '', '/chat');
  }, [user, searchParams, sending]);

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
    setAttachments([]);
    setSidebarOpen(false);
  };

  // File attachment handling
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > 5 * 1024 * 1024) return; // 5MB limit
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        const isImage = file.type.startsWith('image/');
        setAttachments(prev => [...prev, {
          type: isImage ? 'image' : 'file',
          name: file.name,
          data,
          mimeType: file.type,
          preview: isImage ? data : undefined,
        }]);
      };
      reader.readAsDataURL(file);
    });
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || sending) return;
    const msgText = text || (attachments.length > 0 ? `[Sent ${attachments.length} attachment(s)]` : '');
    setInput('');
    const currentAttachments = [...attachments];
    setAttachments([]);
    setSending(true);
    const userMsg: ChatMessage = { role: 'user', content: msgText, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    try {
      const apiAttachments = currentAttachments.length > 0 ? currentAttachments.map(a => ({ type: a.type, name: a.name, data: a.data, mimeType: a.mimeType })) : undefined;
      const res = await api.sendChat(msgText, activeSessionId ?? undefined, apiAttachments);
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  const handleVisualize = async (text: string) => {
    try {
      const lang = (localStorage.getItem('nexigrate-language') as 'en' | 'hi') || 'en';
      const res = await api.visualizeSelection(text.slice(0, 500), 'general', lang);
      setVizContent(res.mermaid);
    } catch { /* ignore */ }
  };

  const prompts = ['Explain Article 370 in simple terms', 'What is the current fiscal deficit?', 'Compare parliamentary vs presidential systems'];

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><AILoader context="chat" /></main>;

  return (
    <div className="flex h-dvh overflow-hidden bg-paper-100">
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 max-w-[80vw] flex-col border-r border-line bg-paper-50 transition-transform md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-line">
          <Logo />
          <button onClick={() => setSidebarOpen(false)} className="btn-ghost-sm md:hidden" aria-label="Close sidebar">✕</button>
        </div>
        <button onClick={startNewChat} className="btn-primary mx-3 mt-3">+ New Chat</button>
        <nav className="mt-3 flex-1 overflow-y-auto px-3 space-y-1">
          {sessions.length === 0 && (
            <div className="px-2 py-6 text-center">
              <p className="text-sm text-muted-400">No chats yet.</p>
              <p className="text-xs text-muted-400 mt-1">Start a new conversation above.</p>
            </div>
          )}
          {sessions.map(s => (
            <button key={s.id} onClick={() => loadSession(s.id)} className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${s.id === activeSessionId ? 'bg-paper-300 font-medium text-ink-900' : 'text-ink-700 hover:bg-paper-200'}`}>
              {s.title}
            </button>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <button onClick={() => router.push('/dashboard')} className="btn-ghost w-full text-sm">← Dashboard</button>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex flex-1 flex-col min-w-0 h-dvh bg-paper-100">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3 bg-paper-50">
          <button onClick={() => setSidebarOpen(true)} className="btn-ghost-sm md:hidden" aria-label="Open sidebar">☰</button>
          <h1 className="font-serif text-lg font-semibold text-ink-900 truncate">Nexi AI</h1>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-gold-500/10 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="currentColor" className="text-gold-500"/></svg>
              </div>
              <h2 className="font-serif mt-4 text-xl font-bold text-ink-900">Hi, I&apos;m Nexi</h2>
              <p className="mt-2 text-sm text-muted-500">Ask me anything about your exam. You can also attach images!</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {prompts.map(p => (<button key={p} onClick={() => { setInput(p); }} className="pill text-xs">{p}</button>))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`group flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`relative max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-ember-500 text-paper-50' : 'paper-card text-ink-900'}`}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-serif prose-blockquote:border-l-ember-500">
                    <ReactMarkdown
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        // Code block with copy button
                        pre({ children }) {
                          const codeContent = extractCodeText(children);
                          return (
                            <div className="relative group/code my-3">
                              <pre className="!bg-paper-200 dark:!bg-ink-950 !rounded-xl !p-4 !text-xs overflow-x-auto border border-line">
                                {children}
                              </pre>
                              <button
                                onClick={() => handleCopy(codeContent)}
                                className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100 transition-opacity px-2 py-1 rounded-md bg-paper-50/90 border border-line text-[10px] font-medium text-ink-700 hover:text-ink-900"
                              >
                                Copy
                              </button>
                            </div>
                          );
                        },
                        // Inline code
                        code({ className, children, ...props }) {
                          const isBlock = className?.includes('hljs') || className?.includes('language-');
                          if (isBlock) return <code className={className} {...props}>{children}</code>;
                          return <code className="!bg-paper-300 dark:!bg-paper-400 !px-1.5 !py-0.5 !rounded !text-xs !font-mono text-ember-600" {...props}>{children}</code>;
                        },
                        // Tables
                        table({ children }) {
                          return (
                            <div className="my-3 overflow-x-auto rounded-xl border border-line">
                              <table className="w-full text-xs">{children}</table>
                            </div>
                          );
                        },
                        thead({ children }) { return <thead className="bg-paper-200 dark:bg-paper-300">{children}</thead>; },
                        th({ children }) { return <th className="px-3 py-2 text-left font-semibold text-ink-900 border-b border-line">{children}</th>; },
                        td({ children }) { return <td className="px-3 py-2 text-ink-800 border-b border-line/50">{children}</td>; },
                        // Blockquotes
                        blockquote({ children }) {
                          return <blockquote className="!border-l-2 !border-ember-500 !pl-4 !my-3 !py-1 !bg-paper-200/50 !rounded-r-lg !text-ink-800 !italic">{children}</blockquote>;
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                {/* Copy entire message button */}
                {msg.role === 'assistant' && (
                  <button
                    onClick={() => handleCopy(msg.content)}
                    className="absolute -top-2 -right-2 hidden group-hover:flex h-7 w-7 items-center justify-center rounded-full bg-paper-50 border border-line shadow-sm text-muted-500 hover:text-ink-900 transition-colors"
                    aria-label="Copy message"
                    title="Copy to clipboard"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                )}
              </div>
              {msg.role === 'assistant' && msg.content.length > 100 && (
                <button onClick={() => handleVisualize(msg.content)} className="mt-1 text-xs text-ember-600 hover:underline">
                  Visualize this
                </button>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="paper-card max-w-[85%] rounded-2xl px-4 py-3 text-sm text-ink-900">
                <div className="flex items-center gap-2">
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-900 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-900 animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-900 animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </span>
                  <span className="text-xs text-muted-500">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="border-t border-line px-4 py-2 bg-paper-50 flex gap-2 overflow-x-auto">
            {attachments.map((att, i) => (
              <div key={i} className="relative flex-shrink-0 group/att">
                {att.type === 'image' && att.preview ? (
                  <img src={att.preview} alt={att.name} className="h-16 w-16 rounded-lg object-cover border border-line" />
                ) : (
                  <div className="h-16 w-16 rounded-lg border border-line bg-paper-200 flex flex-col items-center justify-center">
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-muted-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span className="text-[8px] text-muted-400 mt-0.5 truncate w-14 text-center">{att.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(i)}
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-ember-500 text-white flex items-center justify-center text-[10px] opacity-0 group-hover/att:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-line p-3 sm:p-4 bg-paper-50">
          <div className="mx-auto max-w-2xl relative flex items-end gap-2">
            {/* Attachment button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 h-10 w-10 rounded-xl border border-line bg-paper-100 flex items-center justify-center text-muted-500 hover:text-ink-900 hover:bg-paper-200 transition-colors"
              title="Attach image or file"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            {/* Text input */}
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                rows={1}
                className="input w-full resize-none pr-12 min-h-[44px] max-h-[120px]"
                style={{ height: 'auto', overflow: 'hidden' }}
                onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; }}
              />
              <button
                onClick={sendMessage}
                disabled={(!input.trim() && attachments.length === 0) || sending}
                className="absolute right-2 bottom-2 btn-primary h-8 w-8 rounded-lg p-0 flex items-center justify-center disabled:opacity-50 text-sm"
                aria-label="Send message"
              >
                ➤
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Visualize modal */}
      {vizContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setVizContent(null)}>
          <div className="paper-card max-w-lg w-full max-h-[80vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif text-lg font-bold text-ink-900">Visualization</h3>
            <pre className="mt-4 text-xs bg-paper-200 p-4 rounded-lg overflow-auto whitespace-pre-wrap">{vizContent}</pre>
            <button onClick={() => setVizContent(null)} className="btn-ghost mt-4 w-full">Close</button>
          </div>
        </div>
      )}

      {/* Copy toast */}
      {copyToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-ink-900 text-paper-50 text-sm shadow-xl animate-fadeIn">
          ✓ Copied to clipboard
        </div>
      )}
    </div>
  );
}

/** Extract text content from code block children for copy */
function extractCodeText(children: React.ReactNode): string {
  if (!children) return '';
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractCodeText).join('');
  if (typeof children === 'object' && 'props' in (children as any)) {
    const props = (children as any).props;
    if (props?.children) return extractCodeText(props.children);
  }
  return '';
}
