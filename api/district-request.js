// =====================================================================
// POST /api/district-request   { email }
// Cherokee County teachers get Science Quest free. They enter their
// @cherokeek12.net email; we email them a signed activation link. The
// email itself is the proof they belong to the district.
// =====================================================================
import { sendEmail, signDistrictToken, SITE_ORIGIN, corsHeaders, json } from './_shared.js';

const DISTRICT_DOMAIN = '@cherokeek12.net';

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  try {
    let { email } = await request.json();
    email = String(email || '').trim().toLowerCase();
    if (!email.endsWith(DISTRICT_DOMAIN)) {
      return json({ error: 'Please use your @cherokeek12.net school email.' }, 400, origin);
    }

    const link = (SITE_ORIGIN || '') + '/api/district-verify?token=' + encodeURIComponent(signDistrictToken(email));
    const html = '<div style="font-family:Georgia,serif;max-width:520px;margin:auto;color:#2a2520;line-height:1.6">' +
      '<h1 style="color:#8b6914">Activate your free Science Quest &#9876;</h1>' +
      '<p>Cherokee County teachers get Science Quest free. Click below to activate your access and generate your 150 student codes:</p>' +
      '<p><a href="' + link + '" style="display:inline-block;background:#d4a747;color:#2a2008;font-weight:bold;padding:12px 22px;border-radius:6px;text-decoration:none">Activate my free access</a></p>' +
      '<p style="font-size:13px;color:#666">This link expires in 24 hours. If you didn\'t request this, you can ignore it.</p>' +
    '</div>';
    await sendEmail({ to: email, subject: 'Activate your free Science Quest access', html });

    return json({ ok: true }, 200, origin);
  } catch (e) {
    // Respond the same on error so we never reveal anything.
    return json({ ok: true }, 200, origin);
  }
}
