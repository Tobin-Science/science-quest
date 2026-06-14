// =====================================================================
// GET /api/welcome?session_id=cs_test_...
// The "thank you" page calls this to turn a completed Stripe checkout
// into the buyer's private dashboard token. The webhook may not have
// finished yet, so this returns { ready:false } and the page polls.
// =====================================================================
import { stripe, adminDb } from './_shared.js';

function j(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function GET(request) {
  try {
    const sessionId = new URL(request.url).searchParams.get('session_id') || '';
    if (!sessionId) return j({ ready: false, error: 'missing session' }, 400);

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.payment_status !== 'paid') return j({ ready: false }, 200);

    const pi = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent && session.payment_intent.id);
    if (!pi) return j({ ready: false }, 200);

    const db = adminDb();
    const { data: owner } = await db.from('quest_owners')
      .select('access_token, email').eq('stripe_payment_intent', pi).maybeSingle();

    // No owner yet => the webhook is still processing; tell the page to poll.
    if (!owner) return j({ ready: false }, 200);

    return j({ ready: true, token: owner.access_token, email: owner.email }, 200);
  } catch (e) {
    return j({ ready: false, error: e.message }, 200);
  }
}
