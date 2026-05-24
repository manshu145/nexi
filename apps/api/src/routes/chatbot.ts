import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth } from '../auth.js';
import type { Logger } from '../logger.js';

/**
 * AI Support Chatbot.
 * AI-first support: resolves common issues automatically.
 * If AI can't resolve, student can escalate to admin (creates a support ticket).
 *
 * POST /v1/chat/message   — send a message, get AI response
 * GET  /v1/chat/history   — recent chat history for the user
 */
export interface ChatbotDeps {
  logger: Logger;
  openaiApiKey?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// In-memory chat store (Firestore in production)
const chatStore = new Map<string, ChatMessage[]>();

const SYSTEM_PROMPT = `You are Nexi, the AI support assistant for Nexigrate — an education platform for Indian students preparing for exams from Class 5 to UPSC.

Your role:
1. Answer questions about how to use the platform (credits, MCQs, chapters, mock tests, referrals, subscriptions)
2. Help with study tips and exam preparation guidance
3. Resolve common issues (can't login, credits not showing, content not loading)
4. If you CANNOT resolve the issue or the student explicitly asks for human help, respond with exactly: [ESCALATE] followed by a brief summary

Knowledge:
- Credits: earned by daily MCQ (50 for pass, 5 for attempt), referrals (100 per signup), daily login. Spent on mock tests, long-form grading, AI features.
- Subscription: ₹599/month removes the need for daily MCQ tests to earn credits
- Content is AI-generated and 3x verified (OpenAI + Gemini + Groq)
- Platform supports: MCQs, chapters, mock tests, long-form answers, Nexipedia, current affairs, exam guides, learning tips
- Exams: Class 5-12 (CBSE, ICSE, state boards), JEE, NEET, UPSC, SSC, Banking, Defence, Law, Management

Be concise, helpful, and friendly. Use simple language. If asked about something outside the platform, politely redirect to study-related topics.`;

export function makeChatbotRoutes(deps: ChatbotDeps): Hono {
  const app = new Hono();

  app.post('/message', async (c) => {
    const principal = requireAuth(c);
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.message !== 'string' || !body.message.trim()) {
      throw new HTTPException(400, { message: 'message field required' });
    }

    const { message } = body as { message: string };
    const userId = principal.userId;

    // Get or create chat history
    if (!chatStore.has(userId)) chatStore.set(userId, []);
    const history = chatStore.get(userId)!;

    // Add user message
    const userMsg: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    history.push(userMsg);

    // Generate AI response
    let aiResponse: string;
    let shouldEscalate = false;

    if (deps.openaiApiKey) {
      try {
        const messages = [
          { role: 'system' as const, content: SYSTEM_PROMPT },
          ...history.slice(-10).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${deps.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.7,
            max_tokens: 500,
            messages,
          }),
        });

        if (response.ok) {
          const data = await response.json() as { choices: Array<{ message: { content: string } }> };
          aiResponse = data.choices[0]?.message?.content?.trim() ?? getFallbackResponse(message);
        } else {
          aiResponse = getFallbackResponse(message);
        }
      } catch {
        aiResponse = getFallbackResponse(message);
      }
    } else {
      aiResponse = getFallbackResponse(message);
    }

    // Check for escalation signal
    if (aiResponse.includes('[ESCALATE]')) {
      shouldEscalate = true;
      aiResponse = aiResponse.replace('[ESCALATE]', '').trim();
      aiResponse += '\n\nI\'m connecting you to our support team. They\'ll respond within 24 hours.';
    }

    // Store assistant message
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString(),
    };
    history.push(assistantMsg);

    // Keep only last 50 messages
    if (history.length > 50) history.splice(0, history.length - 50);

    deps.logger.info('chatbot.message', {
      userId,
      messageLen: message.length,
      escalated: shouldEscalate,
    });

    return c.json({
      response: aiResponse,
      escalated: shouldEscalate,
      timestamp: assistantMsg.timestamp,
    });
  });

  app.get('/history', async (c) => {
    const principal = requireAuth(c);
    const history = chatStore.get(principal.userId) ?? [];
    return c.json({
      messages: history.slice(-30).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
    });
  });

  return app;
}

function getFallbackResponse(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('credit') || lower.includes('balance')) {
    return 'Your credits are earned by completing daily MCQs (50 for passing, 5 for attempting), referring friends (100 per signup), and daily login bonuses. You can check your balance on the dashboard. If credits seem missing, try refreshing the page or logging out and back in.';
  }
  if (lower.includes('subscription') || lower.includes('599') || lower.includes('plan')) {
    return 'The ₹599/month subscription removes the requirement to take daily MCQ tests to earn credits. You get unlimited access to all features. You can subscribe from the Upgrade page on your dashboard.';
  }
  if (lower.includes('login') || lower.includes('sign in') || lower.includes('password')) {
    return 'To sign in, use your Google account or phone number with OTP. If you\'re having trouble, try clearing your browser cache or using an incognito window. If the issue persists, I can escalate to our support team.';
  }
  if (lower.includes('exam') || lower.includes('syllabus')) {
    return 'Nexigrate supports exams from Class 5 to UPSC! Go to your dashboard and use the Progress page to track your preparation. Our AI generates daily content matched to your exam syllabus.';
  }
  if (lower.includes('help') || lower.includes('human') || lower.includes('admin') || lower.includes('escalate')) {
    return '[ESCALATE] The student is requesting human support assistance.';
  }

  return 'I\'m Nexi, your AI study assistant! I can help you with:\n• Platform features (credits, MCQs, chapters, mock tests)\n• Study tips and exam guidance\n• Account issues\n\nWhat would you like help with?';
}
