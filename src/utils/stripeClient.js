import Stripe from "stripe";

let stripeSingleton = null;

export function getStripeConfig() {
  // Read at call-time so dotenv / restarts always pick up current .env
  return {
    secretKey: (process.env.STRIPE_SECRET_KEY || "").trim(),
    publishableKey: (process.env.STRIPE_PUBLISHABLE_KEY || "").trim(),
    webhookSecret: (process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
  };
}

export function getStripe() {
  const { secretKey } = getStripeConfig();
  if (!secretKey) {
    throw new Error(
      "MISSING_STRIPE_CREDENTIALS: set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY",
    );
  }
  // Restricted keys (rk_) often lack PaymentIntent permissions — prefer sk_
  if (!stripeSingleton || stripeSingleton._apiKey !== secretKey) {
    stripeSingleton = new Stripe(secretKey);
    stripeSingleton._apiKey = secretKey;
  }
  return stripeSingleton;
}

/** Major units (e.g. 10.50) → Stripe minor units (cents). */
export function toStripeAmount(amount) {
  const major = Number(amount);
  if (!Number.isFinite(major) || major <= 0) {
    throw new Error("Invalid payment amount for Stripe");
  }
  return Math.round(major * 100);
}

export async function createPaymentIntent({
  amount,
  currency = "USD",
  paymentLinkId,
  description,
}) {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: toStripeAmount(amount),
    currency: String(currency || "USD").toLowerCase(),
    automatic_payment_methods: { enabled: true },
    description: description ? String(description).slice(0, 1000) : undefined,
    metadata: {
      paymentLinkId: String(paymentLinkId),
    },
  });
}

export async function retrievePaymentIntent(paymentIntentId) {
  const stripe = getStripe();
  return stripe.paymentIntents.retrieve(paymentIntentId);
}
