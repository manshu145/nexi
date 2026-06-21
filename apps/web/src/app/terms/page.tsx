import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service — Nexigrate',
  description: 'The terms that govern your use of Nexigrate.',
};

const EFFECTIVE_DATE = 'June 20, 2026';

/**
 * Public Terms of Service page (no auth gate) — linked in-app via Profile →
 * Legal and referenced from the Play Store listing. Server-rendered in English.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 pt-8 pb-20">
      <Link href="/dashboard" className="text-sm text-ember-600 hover:underline">← Back to app</Link>

      <h1 className="font-serif mt-5 text-3xl font-bold text-ink-900">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-500">Last updated: {EFFECTIVE_DATE}</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-ink-800">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Nexigrate, an AI-powered
          exam-preparation platform operated by Vedant Sinha (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
          By creating an account or using the service, you agree to these Terms.
        </p>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">1. Eligibility</h2>
          <p className="mt-2">
            You must be at least 13 years old to use Nexigrate. If you are under 18, you should use the
            service with the involvement of a parent or guardian.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">2. Your account</h2>
          <p className="mt-2">
            You are responsible for keeping your login credentials secure and for all activity under your
            account. Provide accurate information and keep it up to date.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">3. Acceptable use</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Do not misuse the service, attempt to disrupt it, or access it through unauthorised means.</li>
            <li>Do not copy, resell, or redistribute our content without permission.</li>
            <li>Do not use the service for any unlawful purpose.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">4. Subscriptions &amp; payments</h2>
          <p className="mt-2">
            Some features require a paid plan. Payments are processed by Razorpay. Prices and plan details
            are shown in the app before purchase. Unless required by law, payments are non-refundable; for
            billing issues, contact us at the email below.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">5. AI-generated content</h2>
          <p className="mt-2">
            Nexigrate uses AI to generate study material, quizzes, current-affairs summaries, and assistant
            responses. While we strive for accuracy, AI output may occasionally be incomplete or incorrect.
            Please verify important facts from authoritative sources. Content is provided for study and
            informational purposes and is not professional advice.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">6. Intellectual property</h2>
          <p className="mt-2">
            The Nexigrate name, branding, and platform are owned by us. Content provided through the service
            is licensed to you for personal, non-commercial study use only.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">7. Disclaimers &amp; liability</h2>
          <p className="mt-2">
            The service is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum extent
            permitted by law, we are not liable for any indirect or consequential damages arising from your
            use of the service, including reliance on AI-generated content or exam outcomes.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">8. Termination</h2>
          <p className="mt-2">
            You may stop using the service and delete your account at any time. We may suspend or terminate
            access if these Terms are violated.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">9. Governing law</h2>
          <p className="mt-2">
            These Terms are governed by the laws of India. Any disputes will be subject to the jurisdiction
            of the competent courts in India.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">10. Changes</h2>
          <p className="mt-2">
            We may update these Terms from time to time. Continued use after changes means you accept the
            updated Terms.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-lg font-semibold text-ink-900">11. Contact</h2>
          <p className="mt-2">
            Questions about these Terms? Email{' '}
            <a href="mailto:admin@nexigrate.com" className="text-ember-600 hover:underline">admin@nexigrate.com</a>.
          </p>
        </section>

        <p className="pt-4 text-xs text-muted-400">
          See also our <Link href="/privacy" className="text-ember-600 hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
