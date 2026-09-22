import Stripe from "stripe";

export const SOURCING_FEE_AMOUNT_CENTS = 2999;
export const SOURCING_FEE_CURRENCY = "aud";

export type CreateCheckoutResult =
  | { ok: true; checkoutUrl: string; sessionId: string; testMode: boolean }
  | { ok: false; errorCode: string };

export type RefundResult =
  | { ok: true; refundId: string }
  | { ok: false; errorCode: string };

export interface PaymentProvider {
  readonly configured: boolean;
  readonly testMode: boolean;
  createCheckoutSession(input: {
    jobId: number;
    reference: string;
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
  }): Promise<CreateCheckoutResult>;
  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): { ok: true; event: Stripe.Event } | { ok: false; errorCode: string };
  refundPaymentIntent(
    paymentIntentId: string,
    idempotencyKey: string,
  ): Promise<RefundResult>;
}

export class StripePaymentProvider implements PaymentProvider {
  private readonly client: Stripe | null;
  readonly configured: boolean;
  readonly testMode: boolean;

  constructor(
    private readonly secretKey = process.env.STRIPE_SECRET_KEY,
    private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
  ) {
    this.configured = typeof this.secretKey === "string" && this.secretKey.length > 0;
    // Recognizes both standard secret keys (sk_test_/sk_live_) and
    // restricted keys (rk_test_/rk_live_) -- a restricted key scoped to just
    // Checkout Sessions + Refunds is the key this app actually uses, and its
    // test/live-ness is carried by the same _test_/_live_ infix.
    this.testMode = /^[rs]k_test_/.test(this.secretKey ?? "");
    this.client = this.configured
      ? new Stripe(this.secretKey as string, { apiVersion: "2025-02-24.acacia" })
      : null;

    if (this.configured && !this.testMode && process.env.STRIPE_LIVE_PAYMENTS_APPROVED !== "true") {
      // Hard safety rail: this build must never take live payments unless a
      // separate, explicitly-named env var is set by a human outside code.
      // Deliberately NOT NODE_ENV: that value is relied on elsewhere
      // (logger.ts's transport choice, app.ts's CORS origin check) for its
      // standard Node.js meaning, and overloading it with this flag broke
      // both -- the logger crashed trying to load a dev-only worker-thread
      // transport not bundled for serverless, and CORS silently allowed any
      // origin through. Never set STRIPE_SECRET_KEY to a live (sk_live_/
      // rk_live_) key without also reviewing this guard.
      this.client = null;
      (this as { configured: boolean }).configured = false;
    }
  }

  async createCheckoutSession(input: {
    jobId: number;
    reference: string;
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
    customerEmail?: string;
  }): Promise<CreateCheckoutResult> {
    if (!this.client) {
      return { ok: false, errorCode: "stripe_not_configured" };
    }
    try {
      const session = await this.client.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: SOURCING_FEE_CURRENCY,
                unit_amount: SOURCING_FEE_AMOUNT_CENTS,
                product_data: {
                  name: "SourceTradie sourcing service",
                  description:
                    "We source and coordinate a suitable local tradie for your job. Refunded if we can't make a suitable connection.",
                },
              },
              quantity: 1,
            },
          ],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          customer_email: input.customerEmail,
          metadata: {
            jobId: String(input.jobId),
            reference: input.reference,
          },
          payment_intent_data: {
            metadata: {
              jobId: String(input.jobId),
              reference: input.reference,
            },
          },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (!session.url) {
        return { ok: false, errorCode: "stripe_no_checkout_url" };
      }
      return {
        ok: true,
        checkoutUrl: session.url,
        sessionId: session.id,
        testMode: this.testMode,
      };
    } catch {
      return { ok: false, errorCode: "stripe_checkout_failed" };
    }
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): { ok: true; event: Stripe.Event } | { ok: false; errorCode: string } {
    if (!this.client || !this.webhookSecret) {
      return { ok: false, errorCode: "stripe_webhook_not_configured" };
    }
    try {
      const event = this.client.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
      return { ok: true, event };
    } catch {
      return { ok: false, errorCode: "stripe_webhook_signature_invalid" };
    }
  }

  async refundPaymentIntent(
    paymentIntentId: string,
    idempotencyKey: string,
  ): Promise<RefundResult> {
    if (!this.client) {
      return { ok: false, errorCode: "stripe_not_configured" };
    }
    try {
      const refund = await this.client.refunds.create(
        { payment_intent: paymentIntentId },
        { idempotencyKey },
      );
      return { ok: true, refundId: refund.id };
    } catch {
      return { ok: false, errorCode: "stripe_refund_failed" };
    }
  }
}

export function createPaymentProvider(): PaymentProvider {
  return new StripePaymentProvider();
}
