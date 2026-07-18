// =====================================================================
// POST /api/webhook   (Stripe -> us)
// When a Science Quest purchase completes, create the owner (with a secret
// access token + their email) and generate their 150 student codes.
// Registered in Stripe for the single event: checkout.session.completed
// =====================================================================
import { stripe, WEBHOOK_SECRET, adminDb, provisionOwner, upgradeOwnerToFull, SITE_ORIGIN, sendEmail, sign1v1Share } from './_shared.js';

// The "here's your download" email for a 1v1 Science single-game purchase.
function oneVOneEmailHtml(name, link, classLink) {
  const safe = String(name || 'your game').replace(/[<>&]/g, '');
  return '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;color:#1f2933;line-height:1.6">' +
    '<h1 style="color:#2f5fd0;font-size:22px">Your 1v1 Science game is ready</h1>' +
    '<p>Thanks for your purchase! Download <b>' + safe + '</b> below. It’s one self-contained file that plays offline forever &mdash; <b>keep this email</b> so you can re-download anytime, on any computer.</p>' +
    '<p><a href="' + link + '" style="display:inline-block;background:#2f5fd0;color:#fff;font-weight:bold;padding:12px 22px;border-radius:8px;text-decoration:none">Download my game</a></p>' +
    '<p style="font-size:13px;color:#666;word-break:break-all">Or paste this link into your browser:<br>' + link + '</p>' +
    (classLink ?
      '<hr style="border:none;border-top:1px solid #ddd;margin:18px 0">' +
      '<p style="margin:0 0 6px"><b>Share with your class</b></p>' +
      '<p>Paste this class link into Google Classroom, Canvas, or anywhere your students look. When a student clicks it, the game opens right in their browser &mdash; nothing to install or download:</p>' +
      '<p style="font-size:13px;word-break:break-all"><a href="' + classLink + '" style="color:#2f5fd0">' + classLink + '</a></p>'
      : '') +
  '</div>';
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

  // ---- 1v1 Science single-game purchase: email a permanent download link so
  // it's never lost if the buyer leaves the thank-you page. ----
  if (s.mode === 'payment' && s.metadata && s.metadata.product === '1v1_game') {
    try {
      const to = (s.customer_details && s.customer_details.email) || s.customer_email || '';
      const link = (SITE_ORIGIN || '') + '/api/game?s=' + s.id;
      const classLink = (SITE_ORIGIN || '') + '/api/game?share=' +
        encodeURIComponent(sign1v1Share({ grade: s.metadata.grade, game: s.metadata.game, std: s.metadata.std, name: s.metadata.name }));
      if (to) await sendEmail({
        to,
        subject: 'Your 1v1 Science download — ' + (s.metadata.name || 'your game'),
        html: oneVOneEmailHtml(s.metadata.name, link, classLink)
      });
    } catch (e) {}
    return new Response('ok', { status: 200 });
  }

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
