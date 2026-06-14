// =====================================================================
// POST /api/webhook   (Stripe -> us)
// When a Science Quest purchase completes, create the owner (with a secret
// access token + their email) and generate their 150 student codes.
// Registered in Stripe for the single event: checkout.session.completed
// =====================================================================
import { stripe, WEBHOOK_SECRET, adminDb, genToken, genCodes } from './_shared.js';

// Insert 150 codes; on the rare cross-owner code collision (Postgres
// unique violation 23505) regenerate the whole batch and retry.
async function insertCodes(db, ownerId) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const rows = genCodes(150).map(code => ({ code, owner: ownerId }));
    const { error } = await db.from('quest_codes').insert(rows);
    if (!error) return;
    if (error.code !== '23505') throw error;   // a real error, not a duplicate
  }
  throw new Error('could not generate unique codes after several attempts');
}

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

  try {
    // Idempotency: if this payment was already turned into an owner, stop.
    if (paymentIntent) {
      const { data: existing } = await db
        .from('quest_owners').select('id')
        .eq('stripe_payment_intent', paymentIntent).maybeSingle();
      if (existing) return new Response('already processed', { status: 200 });
    }

    const { data: owner, error: oErr } = await db.from('quest_owners')
      .insert({
        access_token: genToken(),
        email,
        source: 'purchase',
        stripe_customer: customer,
        stripe_payment_intent: paymentIntent
      })
      .select('id').single();
    if (oErr) throw oErr;

    await insertCodes(db, owner.id);
    return new Response('ok', { status: 200 });
  } catch (e) {
    // 500 -> Stripe retries the webhook later.
    return new Response('error: ' + e.message, { status: 500 });
  }
}
