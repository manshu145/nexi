'use client';
import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { toast } from 'sonner';
import { useAuth } from '~/lib/auth-context';
import { useUser } from '~/lib/userStore';
import { api, type ChatSessionSummary, type ChatMessage } from '~/lib/api';
import { Logo } from '~/components/Logo';
import { AILoader } from '~/components/ui/AILoader';
import { getClientLocale } from '~/lib/locale';

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

/** Format relative time (e.g., "just now", "2m ago", "1h ago") */
function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
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
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'gpt4o' | 'groq' | 'gemini'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('preferredChatModel') as 'gpt4o' | 'groq' | 'gemini') || 'gpt4o';
    }
    return 'gpt4o';
  });
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const topicHandled = useRef(false);

  useEffect(() => { if (!loading && !user) router.replace('/signin'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    api.getChatHistory().then(r => setSessions(r.sessions)).catch(() => {});
  }, [user]);

  // Handle ?topic= parameter from Current Affairs "Ask Nexi" button
  useEffect(() => {
    if (!user || topicHandled.current) return;
    const topic = searchParams.get('topic');
    if (!topic) return;
    // Mark as handled IMMEDIATELY before any async work to prevent
    // double-fire in React strict mode or rapid re-renders.
    topicHandled.current = true;
    if (sending) return; // already in flight from another trigger
    const chapterContext = searchParams.get('context');
    const contextMessage = chapterContext
      ? `I'm studying "${topic}" and I need help understanding this section:\n\n"${chapterContext}"\n\nPlease explain this in simple terms. If there's anything confusing, break it down step by step. Give me exam-relevant tips for this topic.`
      : `I just read this Current Affairs news: "${topic}"\n\nPlease help me understand:\n1. What are the key facts and why is this important?\n2. Which competitive exams (UPSC, SSC, Banking etc.) could ask questions about this?\n3. What type of questions might come from this topic? Give 2-3 sample MCQs.\n4. Are there any related topics I should study alongside this?`;
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
    setVizContent(null);
    setGeneratedImage(null);
    setSidebarOpen(false);
  };

  const deleteSession = async (sessionId: string) => {
    try {
      await api.deleteChatSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch { /* ignore */ }
    setDeletingSessionId(null);
  };

  const deleteAllChats = async () => {
    try {
      await api.deleteAllChatSessions();
      setSessions([]);
      setActiveSessionId(null);
      setMessages([]);
    } catch { /* ignore */ }
    setConfirmDeleteAll(false);
  };

  const handleModelChange = (model: 'gpt4o' | 'groq' | 'gemini') => {
    setSelectedModel(model);
    localStorage.setItem('preferredChatModel', model);
    setModelDropdownOpen(false);
  };

  // File attachment handling
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        // Previously oversized files were silently skipped, leaving the
        // user wondering why their attachment vanished. Surface a clear error.
        toast.error(`"${file.name}" is larger than 5MB and can't be attached. Please attach a smaller file or compress the image.`);
        return;
      }
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
    const hasImage = attachments.some(a => a.type === 'image');
    // When the student just snaps/attaches a question photo without typing,
    // send a clear "solve this doubt" instruction so the vision model gives
    // a full step-by-step worked solution instead of a vague description.
    const msgText = text
      || (hasImage
        ? 'Solve this question step by step and give the final answer. Explain the concept simply.'
        : (attachments.length > 0 ? `[Sent ${attachments.length} attachment(s)]` : ''));
    setInput('');
    const currentAttachments = [...attachments];
    setAttachments([]);
    setSending(true);
    const userMsg: ChatMessage = { role: 'user', content: msgText, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    try {
      const apiAttachments = currentAttachments.length > 0 ? currentAttachments.map(a => ({ type: a.type, name: a.name, data: a.data, mimeType: a.mimeType })) : undefined;
      const res = await api.sendChat(msgText, activeSessionId ?? undefined, apiAttachments, selectedModel);
      setActiveSessionId(res.sessionId);
      const aiMsg: ChatMessage = { role: 'assistant', content: res.response, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, aiMsg]);
      setSessions(prev => {
        const exists = prev.find(s => s.id === res.sessionId);
        if (exists) return prev;
        return [{ id: res.sessionId, title: res.title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 2 }, ...prev];
      });
    } catch (e) {
      const errText = e instanceof Error ? e.message : 'Failed to send. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${errText}`, timestamp: new Date().toISOString() }]);
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
      const lang = getClientLocale();
      const res = await api.visualizeSelection(text.slice(0, 500), 'general', lang);
      setVizContent(res.mermaid);
    } catch { /* ignore */ }
  };

  const handleGenerateDiagram = () => {
    const topic = input.trim();
    if (!topic) return;
    handleVisualize(topic);
  };

  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<{ type: string; content: string; fallback?: boolean; message?: string } | null>(null);

  // Escape key closes modals
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (vizContent) setVizContent(null);
        if (generatedImage) setGeneratedImage(null);
        if (modelDropdownOpen) setModelDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [vizContent, generatedImage, modelDropdownOpen]);

  const handleGenerateImage = async () => {
    const topic = input.trim();
    if (!topic || generatingImage) return;
    setGeneratingImage(true);
    try {
      const res = await api.generateImage(topic);
      if (res.fallback) {
        // API returned a mermaid fallback — show it WITH the reason so the
        // user isn't left wondering why they got a diagram instead of an
        // image (e.g. limit reached / generation temporarily unavailable),
        // instead of silently swapping in a diagram.
        const msg = (res as { message?: string }).message
          ?? 'Image generation is unavailable right now — showing a diagram instead.';
        setGeneratedImage({ type: 'mermaid', content: res.content, fallback: true, message: msg });
      } else {
        setGeneratedImage(res);
        // PR-42: save generated image to gallery (PR-47: with watermark)
        if (res.type === 'image' && res.content?.startsWith('data:image/')) {
          import('~/lib/watermark').then(({ addWatermark }) =>
            addWatermark(res.content).then(marked =>
              api.saveGeneratedImage(marked, topic, 'chat')
            )
          ).catch(() => {});
        } else if (res.type === 'image' && res.content?.startsWith('http')) {
          // DALL-E 3 URL fallback — fetch image, convert to data URL, watermark, save
          fetch(res.content).then(r => r.blob()).then(blob => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              import('~/lib/watermark').then(({ addWatermark }) =>
                addWatermark(dataUrl).then(marked =>
                  api.saveGeneratedImage(marked, topic, 'chat')
                )
              ).catch(() => {});
            };
            reader.readAsDataURL(blob);
          }).catch(() => {});
        }
      }
    } catch {
      // Total failure — fall back to diagram
      handleVisualize(topic);
    } finally { setGeneratingImage(false); }
  };

  // Personalized greeting & prompts based on user profile.
  // PR-32: pull name + exam from the shared store; only call /study/progress
  // for the recent-chapter suggestion. No more /me round-trip on every
  // chat-page mount.
  const { user: me } = useUser();
  const [userLang, setUserLang] = useState<'en' | 'hi'>('en');
  const [recentChapter, setRecentChapter] = useState<string>('');
  const userName = me?.name?.split(' ')[0] || '';
  const userExam = me?.targetExam || '';

  useEffect(() => {
    if (!user) return;
    setUserLang(getClientLocale());
  }, [user]);

  useEffect(() => {
    if (!me?.targetExam) return;
    let cancelled = false;
    (async () => {
      try {
        const prog = await api.getStudyProgress(me.targetExam!);
        if (cancelled) return;
        const chapters = prog.progress?.completedChapters ?? [];
        if (chapters.length > 0) {
          const last = chapters[chapters.length - 1]!;
          setRecentChapter(last.split('/').pop()?.replace(/-/g, ' ') ?? '');
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [me?.targetExam]);

  const prompts = (() => {
    const examLabel = userExam?.replace(/-/g, ' ').toUpperCase() || 'exam';
    const isHindi = userLang === 'hi';

    // Dynamic prompts based on exam + recent chapter
    if (recentChapter) {
      return isHindi
        ? [`"${recentChapter}" को आसान भाषा में समझाओ`, `${examLabel} के लिए ${recentChapter} से MCQ बनाओ`, `${recentChapter} के important points क्या हैं?`]
        : [`Explain "${recentChapter}" in simple terms`, `Make MCQs from ${recentChapter} for ${examLabel}`, `What are key points of ${recentChapter}?`];
    }

    // Fallback personalized by exam
    if (userExam?.includes('upsc')) {
      return isHindi
        ? ['Article 370 को आसान शब्दों में समझाओ', 'वर्तमान राजकोषीय घाटा क्या है?', 'संसदीय vs राष्ट्रपति प्रणाली की तुलना करो']
        : ['Explain Article 370 in simple terms', 'What is the current fiscal deficit?', 'Compare parliamentary vs presidential systems'];
    }
    if (userExam?.includes('jee')) {
      return isHindi
        ? ['Newton के नियम आसान भाषा में समझाओ', 'Organic Chemistry के basic reactions', 'Integration के shortcuts बताओ']
        : ['Explain Newton\'s laws simply', 'Basic organic chemistry reactions', 'Integration shortcuts & tricks'];
    }
    if (userExam?.includes('neet')) {
      return isHindi
        ? ['Cell division को diagram से समझाओ', 'Human heart का blood flow', 'Genetics के important topics']
        : ['Explain cell division with diagram', 'Blood flow in human heart', 'Important genetics topics for NEET'];
    }
    if (userExam?.includes('ssc') || userExam?.includes('bank')) {
      return isHindi
        ? ['Percentage के short tricks बताओ', 'भारत के प्रमुख बांध और नदियाँ', 'English Grammar tips for SSC']
        : ['Percentage short tricks', 'Major dams & rivers of India', 'English grammar tips for SSC'];
    }
    // Generic fallback
    return isHindi
      ? ['आज का current affairs बताओ', 'मेरी exam preparation कैसी चल रही है?', 'कोई important topic समझाओ']
      : ['Tell me today\'s current affairs', 'How is my exam preparation going?', 'Explain an important topic'];
  })();

  if (loading || !user) return <main className="flex min-h-dvh items-center justify-center"><AILoader context="chat" /></main>;

  return (
    <div className="flex h-dvh overflow-hidden bg-paper-100">
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[80vw] flex-col border-r border-line bg-paper-50 transition-transform duration-200 ease-out md:static md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-line">
          <Logo height={36} />
          <button onClick={() => setSidebarOpen(false)} className="btn-ghost-sm md:hidden" aria-label="Close sidebar">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <button onClick={startNewChat} className="btn-primary mx-3 mt-3 gap-2">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Chat
        </button>
        <nav className="mt-3 flex-1 overflow-y-auto px-3 space-y-0.5">
          {sessions.length === 0 && (
            <div className="px-2 py-6 text-center">
              <p className="text-sm text-muted-400">No chats yet.</p>
              <p className="text-xs text-muted-400 mt-1">Start a new conversation above.</p>
            </div>
          )}
          {sessions.map(s => (
            <div key={s.id} className="group/session relative">
              {deletingSessionId === s.id ? (
                <div className="flex items-center gap-1 rounded-lg px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                  <span className="text-xs text-red-700 dark:text-red-400 flex-1">Delete this chat?</span>
                  <button onClick={() => deleteSession(s.id)} className="text-xs font-medium text-red-600 hover:text-red-800 px-1">Yes</button>
                  <button onClick={() => setDeletingSessionId(null)} className="text-xs font-medium text-muted-500 hover:text-ink-900 px-1">No</button>
                </div>
              ) : (
                <button onClick={() => loadSession(s.id)} className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors pr-8 ${s.id === activeSessionId ? 'bg-paper-300 font-medium text-ink-900' : 'text-ink-700 hover:bg-paper-200'}`}>
                  {s.title}
                </button>
              )}
              {deletingSessionId !== s.id && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeletingSessionId(s.id); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover/session:flex h-6 w-6 items-center justify-center rounded text-muted-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  aria-label="Delete chat"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              )}
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3 space-y-2">
          {sessions.length > 0 && (
            <div>
              {confirmDeleteAll ? (
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                  <span className="text-xs text-red-700 dark:text-red-400">Delete all {sessions.length} chats?</span>
                  <div className="flex gap-1">
                    <button onClick={deleteAllChats} className="text-xs font-medium text-red-600 hover:text-red-800 px-1">Confirm</button>
                    <button onClick={() => setConfirmDeleteAll(false)} className="text-xs font-medium text-muted-500 hover:text-ink-900 px-1">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteAll(true)} className="btn-ghost w-full text-sm text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30">Clear all chats</button>
              )}
            </div>
          )}
          <button onClick={() => router.push('/dashboard')} className="btn-ghost w-full text-sm">&larr; Dashboard</button>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex flex-1 flex-col min-w-0 h-dvh bg-paper-100">
        {/* Header with model indicator */}
        <header className="flex flex-shrink-0 items-center gap-3 border-b border-line px-4 py-3 bg-paper-50">
          <button onClick={() => setSidebarOpen(true)} className="btn-ghost-sm md:hidden" aria-label="Open sidebar">&#x2630;</button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h1 className="font-serif text-lg font-semibold text-ink-900 truncate">Nexi AI</h1>
            {/* Model selector dropdown */}
            <div className="relative">
              <button
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-paper-200 border border-line text-[10px] font-medium text-muted-500 hover:bg-paper-300 transition-colors whitespace-nowrap"
              >
                {selectedModel === 'gpt4o' ? 'GPT-4o' : selectedModel === 'groq' ? 'Groq Llama' : 'Gemini Flash'}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {modelDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setModelDropdownOpen(false)} />
                  <div className="absolute top-full left-0 mt-1 z-[70] w-52 rounded-xl border border-line bg-paper-50 shadow-lg py-1 animate-scaleIn origin-top-left">
                    <button onClick={() => handleModelChange('gpt4o')} className={`w-full px-3 py-2.5 text-left text-sm hover:bg-paper-200 transition-colors ${selectedModel === 'gpt4o' ? 'bg-paper-200 font-medium' : ''}`}>
                      <div className="font-medium text-ink-900">GPT-4o</div>
                      <div className="text-[11px] text-muted-400 mt-0.5">Deep, detailed responses</div>
                    </button>
                    <button onClick={() => handleModelChange('groq')} className={`w-full px-3 py-2.5 text-left text-sm hover:bg-paper-200 transition-colors ${selectedModel === 'groq' ? 'bg-paper-200 font-medium' : ''}`}>
                      <div className="font-medium text-ink-900">Groq Llama</div>
                      <div className="text-[11px] text-muted-400 mt-0.5">Fast responses</div>
                    </button>
                    <button onClick={() => handleModelChange('gemini')} className={`w-full px-3 py-2.5 text-left text-sm hover:bg-paper-200 transition-colors ${selectedModel === 'gemini' ? 'bg-paper-200 font-medium' : ''}`}>
                      <div className="font-medium text-ink-900">Gemini Flash</div>
                      <div className="text-[11px] text-muted-400 mt-0.5">Visual &amp; diagram focus</div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {/* Close button — navigates to dashboard */}
          <button onClick={() => router.push('/dashboard')} className="btn-ghost-sm flex-shrink-0" aria-label="Close chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 sm:px-4 lg:px-6 py-6 scroll-smooth">
          <div className="mx-auto flex w-full min-h-full max-w-3xl flex-col gap-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 animate-fadeIn">
              <div className="w-14 h-14 rounded-2xl bg-gold-500/10 flex items-center justify-center animate-pulse">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="currentColor" className="text-gold-500"/></svg>
              </div>
              <h2 className="font-serif mt-5 text-xl font-bold text-ink-900">
                {userLang === 'hi'
                  ? `नमस्ते${userName ? ` ${userName}` : ''}, मैं Nexi हूँ`
                  : `Hi${userName ? ` ${userName}` : ''}, I'm Nexi`}
              </h2>
              <p className="mt-2 text-sm text-muted-500 max-w-sm leading-relaxed">
                {userLang === 'hi'
                  ? `${userExam ? `${userExam.replace(/-/g, ' ').toUpperCase()} से related` : 'अपनी exam से related'} कुछ भी पूछो। किसी भी सवाल की 📷 फोटो खींचकर step-by-step हल पाओ, या diagram बनाओ!`
                  : `Ask me anything about ${userExam ? userExam.replace(/-/g, ' ').toUpperCase() : 'your exam'}. 📷 Snap a photo of any question for a step-by-step solution, or generate diagrams!`}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-md">
                {prompts.map((p, idx) => (
                  <button
                    key={p}
                    onClick={() => { setInput(p); }}
                    className="pill text-xs hover:border-ember-500 hover:text-ember-600 transition-all duration-150 active:scale-95"
                    style={{ animationDelay: `${idx * 80}ms` }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`group flex flex-col animate-slideUp ${msg.role === 'user' ? 'items-end' : 'items-start'}`} style={{ animationDelay: `${Math.min(i * 50, 200)}ms` }}>
              <div className={`relative text-sm leading-relaxed ${msg.role === 'user' ? 'max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-md bg-ember-500 px-4 py-3 text-paper-50' : 'w-full max-w-full px-0 py-1 text-ink-900'}`}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-serif prose-blockquote:border-l-ember-500">
                    <ReactMarkdown
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        // Code block with ALWAYS VISIBLE copy button
                        pre({ children }) {
                          const codeContent = extractCodeText(children);
                          return (
                            <div className="relative my-3">
                              <pre className="!bg-paper-200 dark:!bg-ink-950 !rounded-xl !p-4 !pr-16 !text-xs overflow-x-auto border border-line">
                                {children}
                              </pre>
                              <button
                                onClick={() => handleCopy(codeContent)}
                                className="absolute top-2 right-2 px-2 py-1 rounded-md bg-paper-300/80 border border-line text-[10px] font-medium text-ink-700 hover:text-ink-900 hover:bg-paper-300 transition-colors"
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
                    className="absolute top-0 right-0 hidden group-hover:flex h-7 w-7 items-center justify-center rounded-full bg-paper-50 border border-line shadow-sm text-muted-500 hover:text-ink-900 transition-colors"
                    aria-label="Copy message"
                    title="Copy to clipboard"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </button>
                )}
              </div>
              {/* Timestamp + Visualize action row */}
              <div className={`flex items-center gap-2 mt-1 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <span className="text-[10px] text-muted-400">{formatRelativeTime(msg.timestamp)}</span>
                {msg.role === 'assistant' && msg.content.length > 100 && (
                  <button onClick={() => handleVisualize(msg.content)} className="text-xs text-ember-600 hover:underline">
                    Visualize
                  </button>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start animate-slideUp">
              <div className="paper-card max-w-[90%] sm:max-w-[80%] lg:max-w-[75%] rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex gap-1.5 items-center">
                    <span className="w-2 h-2 rounded-full bg-ember-500 animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-ember-500/70 animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <span className="w-2 h-2 rounded-full bg-ember-500/40 animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </span>
                  <span className="text-xs text-muted-500 font-medium">Nexi is thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
          </div>
        </div>

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="border-t border-line px-3 sm:px-4 py-2 bg-paper-50 flex gap-2 overflow-x-auto">
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
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-ember-500 text-white flex items-center justify-center text-[10px]"
                >
                  &#x2715;
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Quick action bar + Input area */}
        <div className="flex-shrink-0 border-t border-line p-2 sm:p-3 bg-paper-50/95 backdrop-blur-sm pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {/* Quick action buttons row */}
          <div className="mx-auto max-w-3xl mb-2 flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={sending}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-ember-500/40 bg-ember-500/10 text-xs font-medium text-ember-600 hover:bg-ember-500/20 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              title="Snap a photo of any question and get a step-by-step solution"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span>Solve a doubt</span>
            </button>
            <button
              onClick={handleGenerateImage}
              disabled={!input.trim() || sending || generatingImage}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-line bg-paper-100 text-xs font-medium text-ink-700 hover:bg-paper-200 hover:text-ink-900 hover:border-muted-400 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              title="Generate an AI image from your input text"
            >
              {generatingImage ? (
                <span className="w-3.5 h-3.5 border-2 border-ink-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              )}
              <span>{generatingImage ? 'Generating...' : 'Image'}</span>
            </button>
            <button
              onClick={handleGenerateDiagram}
              disabled={!input.trim() || sending}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-line bg-paper-100 text-xs font-medium text-ink-700 hover:bg-paper-200 hover:text-ink-900 hover:border-muted-400 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              title="Generate a diagram from your input text"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
              <span>Diagram</span>
            </button>
          </div>

          {/* Input row */}
          <div className="mx-auto max-w-3xl relative flex items-end gap-1.5 sm:gap-2">
            {/* Attachment button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 h-10 w-9 sm:w-10 rounded-xl border border-line bg-paper-100 flex items-center justify-center text-muted-500 hover:text-ink-900 hover:bg-paper-200 hover:border-muted-400 transition-all duration-150 active:scale-95"
              title="Attach image or file"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            {/* Camera button — snap a doubt (mobile opens the camera) */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex-shrink-0 h-10 w-9 sm:w-10 rounded-xl border border-line bg-paper-100 flex items-center justify-center text-muted-500 hover:text-ink-900 hover:bg-paper-200 hover:border-muted-400 transition-all duration-150 active:scale-95"
              title="Snap a photo of your doubt"
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
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
                className="input w-full resize-none pr-12 min-h-[44px] max-h-[120px] rounded-xl"
                onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 120) + 'px'; t.style.overflowY = t.scrollHeight > 120 ? 'auto' : 'hidden'; }}
              />
              <button
                onClick={sendMessage}
                disabled={(!input.trim() && attachments.length === 0) || sending}
                className="absolute right-2 bottom-2 h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed bg-ink-900 text-paper-50 hover:bg-ember-500 active:scale-90"
                aria-label="Send message"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Visualize modal */}
      {vizContent && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn" onClick={() => setVizContent(null)}>
          <div className="paper-card max-w-lg w-full max-h-[80vh] overflow-auto p-6 animate-scaleIn" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg font-bold text-ink-900">Visualization</h3>
              <button onClick={() => setVizContent(null)} className="h-8 w-8 rounded-lg bg-paper-200 flex items-center justify-center text-muted-500 hover:text-ink-900 hover:bg-paper-300 transition-colors">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <MermaidRenderer code={vizContent} />
          </div>
        </div>
      )}

      {/* Generated Image modal */}
      {generatedImage && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn" onClick={() => setGeneratedImage(null)}>
          <div className="paper-card max-w-lg w-full max-h-[80vh] overflow-auto p-6 animate-scaleIn" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg font-bold text-ink-900">{generatedImage.fallback ? 'Diagram' : 'Generated Image'}</h3>
              <button onClick={() => setGeneratedImage(null)} className="h-8 w-8 rounded-lg bg-paper-200 flex items-center justify-center text-muted-500 hover:text-ink-900 hover:bg-paper-300 transition-colors">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {generatedImage.fallback && generatedImage.message && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                {generatedImage.message}
              </div>
            )}
            {generatedImage.type === 'image' ? (
              <img src={generatedImage.content} alt="AI Generated" className="w-full rounded-xl border border-line" />
            ) : (
              <MermaidRenderer code={generatedImage.content} />
            )}
          </div>
        </div>
      )}

      {/* Copy toast */}
      {copyToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-ink-900 text-paper-50 text-sm shadow-xl animate-fadeIn">
          &#x2713; Copied to clipboard
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

/** Mermaid diagram renderer component */
function MermaidRenderer({ code }: { code: string }) {
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaidLib = await import('mermaid');
        mermaidLib.default.initialize({
          startOnLoad: false,
          theme: 'neutral',
          fontFamily: 'Inter, system-ui, sans-serif',
          flowchart: { curve: 'basis', padding: 16 },
          securityLevel: 'loose',
        });
        const { svg } = await mermaidLib.default.render('mermaid-chat-' + Date.now(), code);
        if (!cancelled) setSvgHtml(svg);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return <pre className="mt-4 text-xs bg-paper-200 p-4 rounded-lg overflow-auto whitespace-pre-wrap">{code}</pre>;
  }
  if (!svgHtml) {
    return <div className="mt-4 h-32 bg-paper-200 rounded-lg animate-pulse flex items-center justify-center text-sm text-muted-500">Rendering diagram...</div>;
  }
  return <div className="mt-4 overflow-auto rounded-lg border border-line bg-paper-100 p-4" dangerouslySetInnerHTML={{ __html: svgHtml }} />;
}
