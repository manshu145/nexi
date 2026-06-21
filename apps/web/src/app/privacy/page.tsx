import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Nexigrate',
  description: 'How Nexigrate collects, uses, and protects your personal data.',
};

const EFFECTIVE_DATE = 'June 20, 2026';

/**
 * Public Privacy Policy page (no auth gate) — required for the Google Play
 * Store listing and the Data Safety form, and reachable by users in-app via
 * Profile → Legal. Server-rendered in English (legally valid for Play) so it
 * is readable by reviewers and crawlers without JavaScript.
 */
export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 pt-8 pb-20">
      <Link href="/dashboard" className="text-sm text-ember-600 hover:underline">← Back to app</Link>

      <h1 className="font-serif mt-5 text-3xl font-bold text-ink-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-500">Last updated: {EFFECTIVE_DATE}</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-ink-800">
        <p>
          Nexigrate (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is an AI-powered exam-preparation
          platform for Indian students, operated by Vedant Sinha. This Privacy Policy explains what
          information we collect, how we use it, and the choices you have. By using Nexigrate (the
          website, progressive web app, and Android application), you agree to this policy.
        </p>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">1. Information we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Account details:</strong> name and email address (via Google or email sign-in).</li>
            <li><strong>Profile details:</strong> date of birth and areas of interest / target exams you provide during onboarding.</li>
            <li><strong>Payment information:</strong> processed securely by our payment partner Razorpay. We do not store your full card or bank details on our servers; we only keep transaction records (amount, status, plan).</li>
            <li><strong>Usage data:</strong> study activity, quiz attempts, streaks, chat with the AI assistant, and similar in-app interactions used to power your dashboard and recommendations.</li>
            <li><strong>Device &amp; technical data:</strong> basic analytics (e.g., app/page usage) and push-notification tokens if you enable notifications.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">2. How we use your information</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>To create and manage your account and provide the learning features.</li>
            <li>To personalise content, study recommendations, and current-affairs/quiz experiences.</li>
            <li>To process subscriptions and payments.</li>
            <li>To send you relevant notifications and important service updates.</li>
            <li>To maintain security, prevent abuse, and improve the product.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">3. Third-party services</h2>
          <p className="mt-2">We share data only with trusted providers needed to run the service:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Google Firebase</strong> — authentication, database, and hosting.</li>
            <li><strong>Razorpay</strong> — payment processing.</li>
            <li><strong>AI providers</strong> (e.g., OpenAI, Google Gemini, Groq) — to generate study content, quizzes, and assistant replies. Prompts may be sent to these providers to produce responses.</li>
            <li><strong>Email/analytics</strong> — to send transactional emails and understand aggregate usage.</li>
          </ul>
          <p className="mt-2">We do not sell your personal data to anyone.</p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">4. Data retention</h2>
          <p className="mt-2">
            We keep your data for as long as your account is active. You can request deletion of your
            account at any time from Profile → Settings → Delete account, after which we remove your
            personal data, subject to any legal record-keeping obligations.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">5. Your rights</h2>
          <p className="mt-2">
            You can access and download all data we hold about you from Profile → Privacy &amp; My Data,
            and you can delete your account. For any privacy request, contact us at the email below.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">6. Children</h2>
          <p className="mt-2">
            Nexigrate is intended for users aged 13 and above. We do not knowingly collect data from
            children under 13. If you believe a child has provided us data, contact us and we will remove it.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">7. Security</h2>
          <p className="mt-2">
            We use industry-standard measures (encrypted connections, access controls, and a secrets-managed
            backend) to protect your data. No method of transmission over the internet is 100% secure, but we
            work to safeguard your information.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">8. Changes to this policy</h2>
          <p className="mt-2">
            We may update this policy from time to time. Material changes will be reflected by updating the
            &ldquo;Last updated&rdquo; date at the top of this page.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">9. Contact us</h2>
          <p className="mt-2">
            For any questions about this Privacy Policy or your data, email us at{' '}
            <a href="mailto:admin@nexigrate.com" className="text-ember-600 hover:underline">admin@nexigrate.com</a>.
          </p>
        </section>

        <p className="pt-4 text-xs text-muted-400">
          See also our <Link href="/terms" className="text-ember-600 hover:underline">Terms of Service</Link>.
        </p>
      </div>
    </main>
  );
}
