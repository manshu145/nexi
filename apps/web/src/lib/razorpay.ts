'use client';

/**
 * Razorpay Checkout loader.
 *
 * The Razorpay JS SDK is delivered as a non-versioned <script> from
 * checkout.razorpay.com. We lazy-load it on first use rather than baking it
 * into every page bundle (it's ~70 kB and only the upgrade flow needs it).
 */

const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    Razorpay?: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

let scriptPromise: Promise<void> | null = null;

export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay can only be loaded in the browser.'));
  }
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SCRIPT_URL}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Razorpay Checkout script.')),
      );
      return;
    }
    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout script.'));
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export interface CheckoutOpenInput {
  keyId: string;
  orderId: string;
  amount: number;          // paise
  currency: 'INR';
  name: string;            // brand name shown in modal header
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
}

export interface CheckoutResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

/**
 * Opens the Razorpay modal and resolves with the checkout response.
 * Resolves to `null` if the user closes the modal without paying.
 */
export async function openRazorpayCheckout(
  input: CheckoutOpenInput,
): Promise<CheckoutResponse | null> {
  await loadRazorpayCheckout();
  return new Promise<CheckoutResponse | null>((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Razorpay Checkout is not available on window.'));
      return;
    }
    const options = {
      key: input.keyId,
      amount: input.amount,
      currency: input.currency,
      name: input.name,
      description: input.description,
      order_id: input.orderId,
      prefill: input.prefill ?? {},
      notes: input.notes ?? {},
      theme: { color: '#8B2E1A' },
      modal: {
        ondismiss: () => resolve(null),
      },
      handler: (resp: CheckoutResponse) => resolve(resp),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rzp = new (window.Razorpay as any)(options);
    rzp.on(
      'payment.failed',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (event: any) => {
        const description =
          event?.error?.description ?? event?.error?.reason ?? 'payment failed';
        reject(new Error(String(description)));
      },
    );
    rzp.open();
  });
}
