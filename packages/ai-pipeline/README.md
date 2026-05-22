# @nexigrate/ai-pipeline

The 3-model verification pipeline. The trust moat.

```
Source (NCERT / UPSC PYQ / official govt portal)
        \u2193
[Ingest]  chunk + embed (Gemini text-embedding-004) \u2192 pgvector / Vertex
        \u2193
[Generator]  GPT-4o-mini  produces draft Q/A or chapter summary
        \u2193
[Verifier 1]  Gemini 2.5 Flash  scores factual accuracy + flags issues
        \u2193
[Verifier 2]  Groq Llama 3.3   independent cross-check
        \u2193
   All three agree?
        \u2502
   YES: auto-publish, tagged "AI-verified" with provenance
   NO:  enqueue for human SME review in admin panel
```

- Every published item carries: source URL, generation timestamp, three verifier scores, optional SME approver
- Routing is config-driven so we can swap models per task to optimize cost/quality
- **Status**: scaffolded in Phase 3 (content build phase)
