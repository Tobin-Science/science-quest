// =====================================================================
// POST /api/webhook   (Stripe -> us)
// When a Science Quest purchase completes, create the owner (with a secret
// access token + their email) and generate their 150 student codes.
// Registered in Stripe for the single event: checkout.session.completed
// =====================================================================
import { stripe, WEBHOOK_SECRET, adminDb, genToken, genCodes, sendEmail, questEmailHtml } from './_shared.js';

// Give this owner 150 codes, collision-proof at any scale: insert
// candidates skipping any that already exist (code is globally unique),
// then top up the shortfall and repeat until the owner has 150. This
// converges no matter how full the global pool gets.
async function insertCodes(db, ownerId) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const { count, error: cErr } = await db.from('quest_codes')
      .select('code', { count: 'exact', head: true })
      .eq('owner', ownerId);
    if (cErr) throw cErr;
    const have = count || 0;
    if (have >= 150) return;
    const rows = genCodes(150 - have).map(code => ({ code, owner: ownerId }));
    const { error } = await db.from('quest_codes')
      .upsert(rows, { onConflict: 'code', ignoreDuplicates: true });
    if (error) throw error;
  }
  throw new Error('could not generate enough unique codes');
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

    const token = genToken();
    const { data: owner, error: oErr } = await db.from('quest_owners')
      .insert({
        access_token: token,
        email,
        source: 'purchase',
        stripe_customer: customer,
        stripe_payment_intent: paymentIntent
      })
      .select('id').single();
    if (oErr) throw oErr;

    await insertCodes(db, owner.id);

    // Best-effort welcome email (no-op until Resend is configured; never
    // fails the webhook — the welcome page already delivers the link).
    if (email) {
      try { await sendEmail({ to: email, subject: 'Your Science Quest dashboard + 150 codes', html: questEmailHtml(token) }); } catch (e) {}
    }
    return new Response('ok', { status: 200 });
  } catch (e) {
    // 500 -> Stripe retries the webhook later.
    return new Response('error: ' + e.message, { status: 500 });
  }
}
