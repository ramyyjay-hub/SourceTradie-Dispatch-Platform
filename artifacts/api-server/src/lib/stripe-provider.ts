import Stripe from "stripe";
import { logger } from "./logger";

export const SOURCING_FEE_AMOUNT_CENTS = 2999;
export const SOURCING_FEE_CURRENCY = "aud";

export type CreateCheckoutResult =
  | { ok: true; clientSecret: string; sessionId: string; testMode: boolean }
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
    returnUrl: string;
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
    returnUrl: string;
    customerEmail?: string;
  }): Promise<CreateCheckoutResult> {
    if (!this.client) {
      return { ok: false, errorCode: "stripe_not_configured" };
    }
    try {
      const session = await this.client.checkout.sessions.create(
        {
          ui_mode: "embedded",
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
          return_url: input.returnUrl,
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
      if (!session.client_secret) {
        return { ok: false, errorCode: "stripe_no_client_secret" };
      }
      return {
        ok: true,
        clientSecret: session.client_secret,
        sessionId: session.id,
        testMode: this.testMode,
      };
    } catch (err) {
      // Swallowing the real Stripe error made a real production failure
      // (empty-string customer_email rejected by Stripe) take a manual
      // curl-based investigation to diagnose. Logging it costs nothing and
      // saves that next time.
      logger.error({ err }, "stripe checkout session creation failed");
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
    } catch (err) {
      logger.error({ err }, "stripe refund failed");
      return { ok: false, errorCode: "stripe_refund_failed" };
    }
  }
}

export function createPaymentProvider(): PaymentProvider {
  return new StripePaymentProvider();
}
