// =====================================================================
// POST /api/create-checkout
// Starts a Stripe Checkout for the one-time $19.99 Science Quest purchase.
// No login required — Checkout collects the buyer's email, which the
// webhook uses to send them their private dashboard link.
// =====================================================================
import { stripe, PRICE_QUEST, SITE_ORIGIN, corsHeaders, json } from './_shared.js';

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  try {
    const base = SITE_ORIGIN || origin || '';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: PRICE_QUEST, quantity: 1 }],
      customer_creation: 'always',          // make a Customer so Stripe emails a receipt
      success_url: base + '/welcome.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: base + '/?canceled=1',
      metadata: { product: 'science_quest' },
      payment_intent_data: { metadata: { product: 'science_quest' } }
    });
    return json({ url: session.url }, 200, origin);
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}
