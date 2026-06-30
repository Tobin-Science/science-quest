// =====================================================================
// POST /api/create-checkout
// Starts a Stripe Checkout for the one-time $19.99 Science Quest purchase.
// No login required — Checkout collects the buyer's email, which the
// webhook uses to send them their private dashboard link.
// =====================================================================
import { stripe, PRICE_QUEST, SITE_ORIGIN, adminDb, corsHeaders, json } from './_shared.js';

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  try {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const token = body && body.token;

    const base = SITE_ORIGIN || origin || '';
    const metadata = { product: 'science_quest' };
    let success_url = base + '/welcome.html?session_id={CHECKOUT_SESSION_ID}';

    // Upgrade flow: a trial teacher buying from their dashboard. Carry their
    // owner id so the webhook upgrades that SAME account (keeps their codes)
    // and send them back to their dashboard afterward.
    if (token) {
      const { data: owner } = await adminDb().from('quest_owners')
        .select('id').eq('access_token', token).maybeSingle();
      if (owner) {
        metadata.upgrade_owner = owner.id;
        success_url = base + '/dashboard.html?key=' + encodeURIComponent(token) + '&upgraded=1';
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: PRICE_QUEST, quantity: 1 }],
      customer_creation: 'always',          // make a Customer so Stripe emails a receipt
      success_url,
      cancel_url: base + '/?canceled=1',
      metadata,
      payment_intent_data: { metadata }
    });
    return json({ url: session.url }, 200, origin);
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}
