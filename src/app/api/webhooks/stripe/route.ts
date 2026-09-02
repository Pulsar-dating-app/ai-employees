import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripeClient } from "@/lib/stripe/client";
import { dispatchStripeEvent } from "@/lib/stripe/webhooks";

// Trello P4 -- POST /api/webhooks/stripe. Modelled on
// src/app/api/webhooks/instagram/route.ts: raw body, signature verified
// before the payload is trusted, service-role client throughout, no
// merchant session on the request.
//
// Idempotency: Stripe delivers every event at-least-once and retries for
// ~3 days. `stripe_webhook_events` is insert-before-process, and
// `processed_at` (migration 20260902170000) distinguishes "a delivery
// started this" from "a delivery finished this":
//  - our insert won        -> process, then stamp processed_at, 200
//  - row exists, stamped    -> already done, 200
//  - row exists, not stamped-> another delivery is mid-flight, 200 (a later
//                              Stripe retry re-enters if that one failed)
//  - handler throws         -> 500, processed_at left null so the retry
//                              re-processes (bad signature is the only 400)

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error("stripe webhook: STRIPE_WEBHOOK_SECRET is not set");
    return new NextResponse(null, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature ?? "", secret);
  } catch (err) {
    console.error("stripe webhook: signature verification failed", err instanceof Error ? err.message : err);
    return new NextResponse(null, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error: insertError } = await supabase
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, type: event.type });

  if (insertError && insertError.code !== "23505") {
    console.error("stripe webhook: failed to record event", insertError);
    return new NextResponse(null, { status: 500 });
  }

  if (insertError) {
    // 23505 -- seen before. Only skip if a prior delivery actually finished.
    const { data: existing } = await supabase
      .from("stripe_webhook_events")
      .select("processed_at")
      .eq("event_id", event.id)
      .maybeSingle();
    if (existing?.processed_at) {
      return NextResponse.json({ received: true, deduped: true });
    }
    // A concurrent delivery holds it and hasn't finished; let that one run.
    return NextResponse.json({ received: true, inFlight: true });
  }

  try {
    await dispatchStripeEvent(supabase, event);
  } catch (err) {
    console.error("stripe webhook: handler failed", event.type, err);
    // Leave processed_at NULL so Stripe's retry re-processes this event.
    return new NextResponse(null, { status: 500 });
  }

  await supabase
    .from("stripe_webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", event.id);

  return NextResponse.json({ received: true });
}
