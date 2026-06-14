// =====================================================================
// POST /api/validate-code   { code }
// The student door. No login — the code IS the credential. If it's a real
// code, claim the seat (stamp activated_at the first time) and say OK.
// Re-entering the same code is fine and never uses a second seat.
// =====================================================================
import { adminDb, corsHeaders, json } from './_shared.js';

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  try {
    let { code } = await request.json();
    code = String(code || '').trim().toUpperCase();
    if (!code) return json({ ok: false, reason: 'missing code' }, 400, origin);

    const db = adminDb();
    const { data: row, error } = await db.from('quest_codes')
      .select('code, activated_at').eq('code', code).maybeSingle();
    if (error) throw error;

    // 200 with ok:false so the page can show a friendly message (not an error).
    if (!row) return json({ ok: false, reason: 'not found' }, 200, origin);

    const returning = !!row.activated_at;
    if (!returning) {
      const { error: uErr } = await db.from('quest_codes')
        .update({ activated_at: new Date().toISOString() }).eq('code', code);
      if (uErr) throw uErr;
    }
    return json({ ok: true, returning }, 200, origin);
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}
