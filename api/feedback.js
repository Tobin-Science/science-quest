// =====================================================================
// /api/feedback
//   POST { name?, email?, message, page? }  — a teacher leaves feedback.
//     Saves to the quest_feedback table AND emails a copy to the owner,
//     so feedback still arrives even if one of the two paths is down.
//   GET ?key=PASSCODE — owner-only: returns all feedback, newest first.
//     The passcode is never stored here, only its SHA-256 fingerprint.
// =====================================================================
import { adminDb, sendEmail, corsHeaders, json } from './_shared.js';
import crypto from 'node:crypto';

// SHA-256 of the owner passcode (the passcode itself lives only with Derek).
const ADMIN_HASH = '51a2416f200d68d1ffc1063a9c3f396aeb7395e0217055f5ac21843fc3208bd0';
const FEEDBACK_TO = process.env.FEEDBACK_TO || 'derek.tobin@cherokeek12.net';

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function keyMatches(key) {
  const got = crypto.createHash('sha256').update(String(key || '')).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(ADMIN_HASH)); } catch (e) { return false; }
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  let body = {};
  try { body = await request.json(); } catch (e) {}

  // Honeypot: real teachers never fill the invisible "website" field.
  if (body.website) return json({ ok: true }, 200, origin);

  const message = String(body.message || '').trim().slice(0, 4000);
  const name = String(body.name || '').trim().slice(0, 120);
  const email = String(body.email || '').trim().slice(0, 200);
  const page = String(body.page || '').trim().slice(0, 200);
  if (message.length < 3) return json({ error: 'Please write a message first.' }, 400, origin);

  let saved = false, mailed = false;
  try {
    const { error } = await adminDb().from('quest_feedback')
      .insert({ name: name || null, email: email || null, message, page: page || null });
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
        (email ? ' &lt;' + esc(email) + '&gt;' : ' (no email given)') +
        (page ? '<br>Sent from: ' + esc(page) : '') + '</p>' +
      '</div>'
    });
  } catch (e) {}

  if (!saved && !mailed) return json({ error: 'Could not send right now — please try again.' }, 500, origin);
  return json({ ok: true }, 200, origin);
}

export async function GET(request) {
  const origin = request.headers.get('origin');
  const key = new URL(request.url).searchParams.get('key');
  if (!keyMatches(key)) return json({ error: 'Not authorized' }, 401, origin);
  const { data, error } = await adminDb().from('quest_feedback')
    .select('id, created_at, name, email, message, page')
    .order('created_at', { ascending: false }).limit(500);
  if (error) return json({ error: 'Could not load feedback (is the quest_feedback table created?)' }, 500, origin);
  return json({ ok: true, feedback: data || [] }, 200, origin);
}
