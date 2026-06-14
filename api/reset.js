// =====================================================================
// POST /api/reset   { token }
// "Reset for new year": free every seat (clear activated_at + label) for
// this owner's 150 codes. The codes themselves stay the same.
// =====================================================================
import { adminDb, corsHeaders, json } from './_shared.js';

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  try {
    const { token } = await request.json();
    if (!token) return json({ error: 'missing token' }, 400, origin);

    const db = adminDb();
    const { data: owner } = await db.from('quest_owners')
      .select('id').eq('access_token', token).maybeSingle();
    if (!owner) return json({ error: 'not found' }, 404, origin);

    const { error } = await db.from('quest_codes')
      .update({ activated_at: null, label: null })
      .eq('owner', owner.id);
    if (error) throw error;

    return json({ ok: true }, 200, origin);
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}
