export type FaqItem = { q: string; a: string };

export const FAQ: readonly FaqItem[] = [
  {
    q: 'Is Nexigrate really free?',
    a: 'Yes. The credits engine lets you study free forever — take a daily 10-question MCQ, refer friends, or maintain a streak, and you accumulate enough credits to read chapters, run mock tests, and ask the AI tutor. We also offer optional paid plans (₹99 to ₹599/month) for students who want unlimited access without the daily MCQ habit.',
  },
  {
    q: 'How do credits work?',
    a: 'Every action you take to demonstrate effort earns credits, every action you take to learn spends them. Sign up earns 200 credits. Passing a daily MCQ earns 50. Referring a verified friend earns 100. Reading a chapter costs 5. A mock test costs 20. Even a failed MCQ attempt earns 5 credits, so no serious student ever gets locked out.',
  },
  {
    q: 'Which exams are covered now?',
    a: 'We cover 63+ exams including UPSC CSE, SSC CGL/CHSL, JEE Main & Advanced, NEET UG, Class 8-12 CBSE, IBPS PO/Clerk, SBI PO, RRB NTPC, NDA, CDS, Agniveer, CAPF, and State PSCs. All with AI-generated, NCERT-grounded content.',
  },
  {
    q: 'How do you make sure the content is correct?',
    a: 'Every chapter, MCQ, and explanation goes through a 3-AI verification pipeline (OpenAI, Gemini, and Groq Llama, from three different model families) and is then reviewed by a human subject-matter expert before it is shown to a student. Every fact is traceable back to its primary source — NCERT, UPSC PYQs, or an official Government of India publication.',
  },
  {
    q: 'When does the mobile app launch?',
    a: 'The web PWA ships first; the React Native iOS and Android apps follow within four to six weeks. They share the same TypeScript codebase and the same backend, so the experience is identical.',
  },
  {
    q: 'Is my data safe?',
    a: 'Your data is stored in India (Mumbai region), encrypted in transit and at rest, and never sold. We are building to be DPDP Act 2023 compliant from day one, including verifiable parental consent for users under 18. Your verification documents are deleted from active storage 30 days after approval.',
  },
  {
    q: 'Why do I need to verify my phone number?',
    a: 'Phone verification prevents duplicate accounts and spam. It ensures every user is a real student so we can keep the platform free and distraction-free. We never share your phone number with anyone.',
  },
];
