export type FaqItem = { q: string; a: string };

export const FAQ: readonly FaqItem[] = [
  {
    q: 'Is Nexigrate really free?',
    a: 'Yes. The credits engine lets you study free forever — take a daily 10-question MCQ, refer friends, or maintain a streak, and you accumulate enough credits to read chapters, run mock tests, and ask the AI tutor. We also offer optional paid plans (₹79 to ₹599/month) for students who want unlimited access without the daily MCQ habit.',
  },
  {
    q: 'How do credits work?',
    a: 'Every action you take to demonstrate effort earns credits, every action you take to learn spends them. Sign-up earns 100 credits, daily login earns 5, completing a chapter earns 20, and passing the daily MCQ at 70%+ earns 10. A 7-day streak adds 5, a 30-day streak adds 10. Reading a chapter costs 5, a mock test costs 20, a question to the AI tutor costs 2. Refer a friend and you earn 50 while they get 100. Defaults can be tuned by us — your in-app Credits page always shows the live earn and spend rates.',
  },
  {
    q: 'Which exams are covered now?',
    a: 'We cover 40+ exams including UPSC CSE, SSC CGL/CHSL/MTS/GD, JEE Main & Advanced, BITSAT, NEET UG, NEET PG, Class 5-12 (CBSE, ICSE & ISC), IBPS PO/Clerk, SBI PO/Clerk, RBI Grade B, NDA, CDS, Agniveer, AFCAT, and State PSCs (UPPSC, MPPSC, BPSC, RPSC) — plus professional skills like Python, Data Science, and Digital Marketing. All with AI-generated, NCERT-grounded content.',
  },
  {
    q: 'How do you make sure the content is correct?',
    a: 'Every chapter, MCQ, and explanation goes through a 3-layer AI verification pipeline (OpenAI, Gemini, and Groq Llama, from three different model families). Outputs where the three disagree, or any single model flags low confidence, are auto-regenerated rather than shipped to students. Every fact is traceable back to its primary source — NCERT, UPSC PYQs, or an official Government of India publication.',
  },
  {
    q: 'Is there a mobile app?',
    a: 'Yes — Nexigrate is a Progressive Web App (PWA), which means you can install it on your phone like a native app. On Android: open nexigrate.com or app.nexigrate.com in Chrome and tap "Add to Home Screen" from the menu. On iPhone: open in Safari and tap the share button, then "Add to Home Screen". You\'ll get a fast, full-screen, native-feeling experience with offline support for cached chapters. Native iOS and Android apps may follow later, but the PWA is what we ship today and what we recommend for now.',
  },
  {
    q: 'Is my data safe?',
    a: 'Your data is stored in India (Mumbai region), encrypted in transit and at rest, and never sold. We are building to be DPDP Act 2023 compliant from day one. We do not run third-party ad trackers on the site, and minors should use Nexigrate with the knowledge of a parent or guardian.',
  },
  {
    q: 'How do I cancel my paid plan?',
    a: 'One click — open your profile, go to Plan & Billing, and tap "Cancel Plan". You keep full access to whatever you paid for until the period ends, then drop to the Free plan automatically. There is no auto-renewal, no future charge, and no refund on completed payments — that trade-off is what lets us keep prices low and avoid renewal nag emails. You can resume any time before the period ends and your plan picks up where it left off.',
  },
  {
    q: 'Why do I need to verify my phone number?',
    a: 'Phone verification prevents duplicate accounts and spam. It ensures every user is a real student so we can keep the platform free and distraction-free. We never share your phone number with anyone.',
  },
];
