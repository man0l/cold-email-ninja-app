/**
 * Edge Function: billing/webhook
 * Handles Stripe webhook events for subscription updates, payments, etc.
 * Stripe will call this endpoint (must be added to Stripe settings)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getSupabaseClient, jsonResponse, errorResponse } from "../_shared/supabase.ts";

// Verify webhook signature (you'll get this from Stripe dashboard)
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

interface StripeCustomer {
  id: string;
  email: string;
  metadata: { customer_id?: string };
}

interface StripeSubscriptionEvent {
  id: string;
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  metadata?: { customer_id?: string };
}

interface StripeInvoice {
  id: string;
  customer: string;
  subscription: string;
  status: string;
  amount_paid: number;
  period_start: number;
  period_end: number;
  metadata?: { customer_id?: string };
}

interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: StripeCustomer | StripeSubscriptionEvent | StripeInvoice };
}

Deno.serve(async (req: Request) => {
  // Only POST allowed
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // TODO: Verify signature using crypto
    // For now, we'll skip verification (use in production!)
    // const verified = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET);
    // if (!verified) return errorResponse("Signature verification failed", 403);

    const event = JSON.parse(body) as StripeWebhookEvent;
    const supabase = getSupabaseClient(req);

    console.log(`Processing Stripe event: ${event.type} (${event.id})`);

    // Route based on event type
    switch (event.type) {
      case "customer.subscription.updated": {
        const subscription = event.data.object as StripeSubscriptionEvent;
        await handleSubscriptionUpdated(supabase, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as StripeSubscriptionEvent;
        await handleSubscriptionDeleted(supabase, subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as StripeInvoice;
        await handleInvoicePaid(supabase, invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as StripeInvoice;
        await handleInvoiceFailed(supabase, invoice);
        break;
      }

      default:
        console.log(`Skipping unhandled event: ${event.type}`);
    }

    return jsonResponse({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return errorResponse(String(err), 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════

async function handleSubscriptionUpdated(
  supabase: any,
  subscription: StripeSubscriptionEvent
) {
  // Find customer by Stripe subscription ID
  const { data: subs, error } = await supabase
    .from("user_subscriptions")
    .select("customer_id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (error || !subs) {
    console.warn(`Subscription ${subscription.id} not found locally`);
    return;
  }

  // Update subscription status
  const { error: updateError } = await supabase
    .from("user_subscriptions")
    .update({
      status: subscription.status === "active" ? "active" : "past_due",
      billing_period_start: new Date(
        subscription.current_period_start * 1000
      ).toISOString(),
      billing_period_end: new Date(
        subscription.current_period_end * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (updateError) {
    console.error("Error updating subscription:", updateError);
  }
}

async function handleSubscriptionDeleted(
  supabase: any,
  subscription: StripeSubscriptionEvent
) {
  // Mark as canceled
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error("Error canceling subscription:", error);
  }
}

async function handleInvoicePaid(supabase: any, invoice: StripeInvoice) {
  // Find or create invoice record
  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("stripe_invoice_id", invoice.id)
    .single();

  if (existing) {
    // Update existing invoice
    const { error } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_invoice_id", invoice.id);

    if (error) console.error("Error updating invoice:", error);
  } else {
    // Create new invoice record
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("id, customer_id")
      .eq("stripe_subscription_id", invoice.subscription)
      .single();

    if (!sub) {
      console.warn(`Subscription ${invoice.subscription} not found`);
      return;
    }

    const { error } = await supabase.from("invoices").insert({
      customer_id: sub.customer_id,
      subscription_id: sub.id,
      stripe_invoice_id: invoice.id,
      status: "paid",
      period_start: new Date(invoice.period_start * 1000).toISOString(),
      period_end: new Date(invoice.period_end * 1000).toISOString(),
      total_amount_cents: invoice.amount_paid,
      paid_at: new Date().toISOString(),
    });

    if (error) console.error("Error creating invoice:", error);
  }
}

async function handleInvoiceFailed(supabase: any, invoice: StripeInvoice) {
  // Update subscription status to past_due
  const { error: subError } = await supabase
    .from("user_subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", invoice.subscription);

  if (subError) {
    console.error("Error updating subscription to past_due:", subError);
  }

  // Update or create invoice record
  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("stripe_invoice_id", invoice.id)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("invoices")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_invoice_id", invoice.id);

    if (error) console.error("Error updating invoice:", error);
  } else {
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("id, customer_id")
      .eq("stripe_subscription_id", invoice.subscription)
      .single();

    if (!sub) return;

    const { error } = await supabase.from("invoices").insert({
      customer_id: sub.customer_id,
      subscription_id: sub.id,
      stripe_invoice_id: invoice.id,
      status: "failed",
      period_start: new Date(invoice.period_start * 1000).toISOString(),
      period_end: new Date(invoice.period_end * 1000).toISOString(),
      total_amount_cents: invoice.amount_paid,
    });

    if (error) console.error("Error creating invoice:", error);
  }
}
