// =====================================================================
// POST /api/dashboard   { token }
// Returns the owner's codes + seat counts, looked up by their secret
// access token (service role; the tables have no public access).
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
    const { data: owner, error } = await db.from('quest_owners')
      .select('id, email, source, created_at')
      .eq('access_token', token).maybeSingle();
    if (error) throw error;
    if (!owner) return json({ error: 'not found' }, 404, origin);

    const { data: codes, error: cErr } = await db.from('quest_codes')
      .select('code, label, activated_at')
      .eq('owner', owner.id)
      .order('created_at', { ascending: true });
    if (cErr) throw cErr;

    const used = codes.filter(c => c.activated_at).length;
    return json({ email: owner.email, source: owner.source, total: codes.length, used, codes }, 200, origin);
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}
