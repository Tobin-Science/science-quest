// =====================================================================
// /api/district   — Cherokee County free-access flow (one function so we
// stay under Vercel Hobby's 12-function limit; site feedback rides along
// here for the same reason).
//   POST { email }             -> email a signed activation link
//   POST { kind:'feedback' }   -> save + email site feedback
//   GET  ?token=...            -> verify the link, grant free access,
//                                 redirect to the teacher dashboard
//   GET  ?fbkey=PASSCODE       -> owner-only: list all feedback
// =====================================================================
import { adminDb, provisionOwner, sendEmail, signDistrictToken, verifyDistrictToken, signTrialToken, verifyTrialToken, trialConfirmEmailHtml, TRIAL_SEATS, TRIAL_DAYS, SITE_ORIGIN, corsHeaders, json } from './_shared.js';
import crypto from 'node:crypto';

const DISTRICT_DOMAIN = '@cherokeek12.net';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// --- Site feedback (form on /feedback.html, inbox on /feedback-admin.html).
// The owner passcode is never stored here, only its SHA-256 fingerprint.
const FEEDBACK_ADMIN_HASH = '51a2416f200d68d1ffc1063a9c3f396aeb7395e0217055f5ac21843fc3208bd0';
const FEEDBACK_TO = process.env.FEEDBACK_TO || 'derek.tobin@cherokeek12.net';
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function feedbackKeyMatches(key) {
  const got = crypto.createHash('sha256').update(String(key || '')).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(FEEDBACK_ADMIN_HASH)); } catch (e) { return false; }
}

function note(message) {
  return new Response(
    '<!doctype html><meta charset="utf-8"><body style="font-family:Georgia,serif;background:#2a2520;color:#f4e4bc;text-align:center;padding:60px 24px">' +
    message + '</body>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

// Teacher asks for a free activation link (district) OR a free-trial
// confirmation link (kind:'trial').
export async function POST(request) {
  const origin = request.headers.get('origin');
  try {
    const body = await request.json();
    let { email, kind } = body;
    email = String(email || '').trim().toLowerCase();

    // ---- Site feedback: save to quest_feedback AND email a copy, so it
    // still arrives even if one of the two paths is down. ----
    if (kind === 'feedback') {
      if (body.website) return json({ ok: true }, 200, origin);   // honeypot
      const message = String(body.message || '').trim().slice(0, 4000);
      const name = String(body.name || '').trim().slice(0, 120);
      const page = String(body.page || '').trim().slice(0, 200);
      const fbEmail = String(body.email || '').trim().slice(0, 200);
      if (message.length < 3) return json({ error: 'Please write a message first.' }, 400, origin);

      let saved = false, mailed = false;
      try {
        const { error } = await adminDb().from('quest_feedback')
          .insert({ name: name || null, email: fbEmail || null, message, page: page || null });
        saved = !error;
      } catch (e) {}
      try {
        mailed = await sendEmail({
          to: FEEDBACK_TO,
          subject: 'New feedback on TobinScience.com',
          html: '<div style="font-family:Georgia,serif;max-width:540px;margin:auto;color:#2a2520;line-height:1.6">' +
            '<h2 style="color:#2456b3;margin:0 0 10px">New feedback</h2>' +
            '<p style="white-space:pre-wrap;background:#f6f8fb;border:1px solid #e4e9ee;border-radius:8px;padding:14px">' + esc(message) + '</p>' +
            '<p style="font-size:14px;color:#555;margin:10px 0 0">From: <b>' + (esc(name) || 'no name given') + '</b>' +
            (fbEmail ? ' &lt;' + esc(fbEmail) + '&gt;' : ' (no email given)') +
            (page ? '<br>Sent from: ' + esc(page) : '') + '</p>' +
          '</div>'
        });
      } catch (e) {}
      if (!saved && !mailed) return json({ error: 'Could not send right now — please try again.' }, 500, origin);
      return json({ ok: true }, 200, origin);
    }

    // ---- Free-trial confirmation: any valid email, 5 seats for a week. ----
    if (kind === 'trial') {
      if (!EMAIL_RE.test(email)) {
        return json({ error: 'Please enter a valid email address.' }, 400, origin);
      }
      const link = (SITE_ORIGIN || '') + '/api/district?ttoken=' + encodeURIComponent(signTrialToken(email));
      await sendEmail({ to: email, subject: 'Confirm your email to start your free week of Science Quest', html: trialConfirmEmailHtml(link) });
      return json({ ok: true }, 200, origin);
    }

    // ---- District free access: @cherokeek12.net only. ----
    if (!email.endsWith(DISTRICT_DOMAIN)) {
      return json({ error: 'Please use your @cherokeek12.net school email.' }, 400, origin);
    }
    const link = (SITE_ORIGIN || '') + '/api/district?token=' + encodeURIComponent(signDistrictToken(email));
    const html = '<div style="font-family:Georgia,serif;max-width:520px;margin:auto;color:#2a2520;line-height:1.6">' +
      '<h1 style="color:#8b6914">Activate your free Science Quest &#9876;</h1>' +
      '<p>Cherokee County teachers get Science Quest free. Click below to activate your access and generate your 150 student codes:</p>' +
      '<p><a href="' + link + '" style="display:inline-block;background:#d4a747;color:#2a2008;font-weight:bold;padding:12px 22px;border-radius:6px;text-decoration:none">Activate my free access</a></p>' +
      '<p style="font-size:13px;color:#666">This link expires in 24 hours. If you didn\'t request this, you can ignore it.</p>' +
    '</div>';
    await sendEmail({ to: email, subject: 'Activate your free Science Quest access', html });
    return json({ ok: true }, 200, origin);
  } catch (e) {
    return json({ ok: true }, 200, origin);
  }
}

// Teacher clicks the link from the email — district activation (?token=)
// or free-trial confirmation (?ttoken=).
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;

    // ---- Feedback inbox (owner only) ----
    const fbkey = params.get('fbkey');
    if (fbkey !== null) {
      if (!feedbackKeyMatches(fbkey)) return json({ error: 'Not authorized' }, 401);
      const { data, error } = await adminDb().from('quest_feedback')
        .select('id, created_at, name, email, message, page')
        .order('created_at', { ascending: false }).limit(500);
      if (error) return json({ error: 'Could not load feedback (is the quest_feedback table created?)' }, 500);
      return json({ ok: true, feedback: data || [] }, 200);
    }

    // ---- Free-trial confirmation ----
    const ttoken = params.get('ttoken');
    if (ttoken) {
      const email = verifyTrialToken(ttoken);
      if (!email) {
        return note('This free-week link is invalid or has expired. Please request a new one from the store page.');
      }
      const db = adminDb();
      // One trial (or account) per email: if they already have ANY account,
      // send them to it rather than minting a fresh week.
      const { data: existing } = await db.from('quest_owners')
        .select('access_token').ilike('email', email).limit(1).maybeSingle();
      const accessToken = existing
        ? existing.access_token
        : await provisionOwner(db, { email, source: 'trial', seats: TRIAL_SEATS, trialDays: TRIAL_DAYS });
      return new Response(null, {
        status: 302,
        headers: { Location: '/dashboard.html?key=' + encodeURIComponent(accessToken) }
      });
    }

    // ---- District activation ----
    const token = params.get('token') || '';
    const email = verifyDistrictToken(token);
    if (!email || !email.endsWith(DISTRICT_DOMAIN)) {
      return note('This activation link is invalid or has expired. Please request a new one.');
    }
    const db = adminDb();
    const { data: existing } = await db.from('quest_owners')
      .select('access_token').ilike('email', email).limit(1).maybeSingle();
    const accessToken = existing
      ? existing.access_token
      : await provisionOwner(db, { email, source: 'district' });
    return new Response(null, {
      status: 302,
      headers: { Location: '/dashboard.html?key=' + encodeURIComponent(accessToken) }
    });
  } catch (e) {
    return note('Something went wrong activating your access. Please try again in a moment.');
  }
}
