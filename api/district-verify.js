// =====================================================================
// GET /api/district-verify?token=...
// The link from the activation email. Validates the signed token, then
// grants free access (creates a district owner + 150 codes) and drops the
// teacher straight onto their dashboard. Clicking twice is safe.
// =====================================================================
import { adminDb, provisionOwner, verifyDistrictToken } from './_shared.js';

function note(message) {
  return new Response(
    '<!doctype html><meta charset="utf-8"><body style="font-family:Georgia,serif;background:#2a2520;color:#f4e4bc;text-align:center;padding:60px 24px">' +
    message + '</body>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(request) {
  try {
    const token = new URL(request.url).searchParams.get('token') || '';
    const email = verifyDistrictToken(token);
    if (!email || !email.endsWith('@cherokeek12.net')) {
      return note('This activation link is invalid or has expired. Please request a new one.');
    }

    const db = adminDb();
    // Already activated? Reuse their existing access (clicking twice is fine).
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
