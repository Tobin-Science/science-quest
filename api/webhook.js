// =====================================================================
// POST /api/webhook   (Stripe -> us)
// When a Science Quest purchase completes, create the owner (with a secret
// access token + their email) and generate their 150 student codes.
// Registered in Stripe for the single event: checkout.session.completed
// =====================================================================
import { stripe, WEBHOOK_SECRET, adminDb, provisionOwner, upgradeOwnerToFull } from './_shared.js';

export async function POST(request) {
  const sig = request.headers.get('stripe-signature');
  const raw = await request.text();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, WEBHOOK_SECRET);
  } catch (e) {
    return new Response('Bad signature', { status: 400 });
  }

  // We only care about completed checkouts for THIS product.
  if (event.type !== 'checkout.session.completed') {
    return new Response('ignored', { status: 200 });
  }
  const s = event.data.object;
  const isQuest = s.mode === 'payment' && s.metadata && s.metadata.product === 'science_quest';
  if (!isQuest) return new Response('not a quest purchase', { status: 200 });

  const db = adminDb();
  const paymentIntent = typeof s.payment_intent === 'string'
    ? s.payment_intent : (s.payment_intent && s.payment_intent.id) || null;
  const email = (s.customer_details && s.customer_details.email) || s.customer_email || '';
  const customer = typeof s.customer === 'string'
    ? s.customer : (s.customer && s.customer.id) || null;
  const upgradeOwner = (s.metadata && s.metadata.upgrade_owner) || null;

  try {
    // Idempotency: if this payment was already turned into an owner, stop.
    if (paymentIntent) {
      const { data: existing } = await db
        .from('quest_owners').select('id')
        .eq('stripe_payment_intent', paymentIntent).maybeSingle();
      if (existing) return new Response('already processed', { status: 200 });
    }

    if (upgradeOwner) {
      // A free-trial teacher upgraded: convert their EXISTING account to a
      // full lifetime 150-code one (their handed-out codes keep working).
      await upgradeOwnerToFull(db, upgradeOwner, { stripe_customer: customer, stripe_payment_intent: paymentIntent });
    } else {
      await provisionOwner(db, { email, source: 'purchase', stripe_customer: customer, stripe_payment_intent: paymentIntent });
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    // 500 -> Stripe retries the webhook later.
    return new Response('error: ' + e.message, { status: 500 });
  }
}
