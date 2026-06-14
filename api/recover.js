// =====================================================================
// POST /api/recover   { email }
// "Email me my link." Looks up purchases by email and re-sends the
// private dashboard link. Always responds the same way so it never
// reveals who does or doesn't have an account.
// =====================================================================
import { adminDb, sendEmail, questEmailHtml, corsHeaders, json } from './_shared.js';

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  try {
    let { email } = await request.json();
    email = String(email || '').trim();
    if (email) {
      const db = adminDb();
      const { data: owners } = await db.from('quest_owners')
        .select('access_token, email').ilike('email', email);
      for (const o of (owners || [])) {
        try { await sendEmail({ to: o.email, subject: 'Your Science Quest dashboard link', html: questEmailHtml(o.access_token) }); } catch (e) {}
      }
    }
  } catch (e) { /* swallow — always respond the same */ }
  return json({ ok: true }, 200, origin);
}
