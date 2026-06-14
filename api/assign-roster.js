// =====================================================================
// POST /api/assign-roster   { token, names: [...] }
// Bulk-labels the owner's codes, in order, with a pasted class roster
// (one student per code). Names beyond the 150 codes are reported as
// overflow. Individual click-to-label still works alongside this.
// =====================================================================
import { adminDb, corsHeaders, json } from './_shared.js';

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  try {
    const { token, names } = await request.json();
    if (!token) return json({ error: 'missing token' }, 400, origin);
    if (!Array.isArray(names)) return json({ error: 'names must be a list' }, 400, origin);

    const clean = names.map(n => String(n || '').trim().slice(0, 60)).filter(Boolean);

    const db = adminDb();
    const { data: owner } = await db.from('quest_owners')
      .select('id').eq('access_token', token).maybeSingle();
    if (!owner) return json({ error: 'not found' }, 404, origin);

    const { data: codes, error } = await db.from('quest_codes')
      .select('code').eq('owner', owner.id)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const n = Math.min(clean.length, codes.length);
    const rows = [];
    for (let i = 0; i < n; i++) rows.push({ code: codes[i].code, owner: owner.id, label: clean[i] });
    if (rows.length) {
      const { error: uErr } = await db.from('quest_codes').upsert(rows, { onConflict: 'code' });
      if (uErr) throw uErr;
    }

    return json({
      ok: true,
      assigned: n,
      provided: clean.length,
      capacity: codes.length,
      overflow: Math.max(0, clean.length - codes.length)
    }, 200, origin);
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}
