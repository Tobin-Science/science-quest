// =====================================================================
// POST /api/label   { token, code, label }
// Sets (or clears) the optional student-name label on one code.
// =====================================================================
import { adminDb, corsHeaders, json } from './_shared.js';

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  try {
    const { token, code, label } = await request.json();
    if (!token || !code) return json({ error: 'missing token or code' }, 400, origin);

    const db = adminDb();
    const { data: owner } = await db.from('quest_owners')
      .select('id').eq('access_token', token).maybeSingle();
    if (!owner) return json({ error: 'not found' }, 404, origin);

    const { error } = await db.from('quest_codes')
      .update({ label: (label || '').trim().slice(0, 60) || null })
      .eq('owner', owner.id).eq('code', code);
    if (error) throw error;

    return json({ ok: true }, 200, origin);
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}
