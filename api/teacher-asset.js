// =====================================================================
// POST /api/teacher-asset   { token, asset }
// Returns a short-lived signed URL to a teacher-only protected file
// (the Hall of Champions leaderboard, or the Strategy Guide PDF), but
// only for a verified owner (by their access token).
// =====================================================================
import { adminDb, signAsset, corsHeaders, json } from './_shared.js';

const FILES = { leaderboard: 'leaderboard.html', guide: 'guide.pdf' };

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  try {
    const { token, asset } = await request.json();
    const file = FILES[asset];
    if (!token || !file) return json({ error: 'bad request' }, 400, origin);

    const db = adminDb();
    const { data: owner } = await db.from('quest_owners')
      .select('id').eq('access_token', token).maybeSingle();
    if (!owner) return json({ error: 'not found' }, 404, origin);

    const url = await signAsset(db, file, 3600); // 1 hour
    if (!url) return json({ error: 'that file is not available yet' }, 404, origin);
    return json({ url }, 200, origin);
  } catch (e) {
    return json({ error: e.message }, 500, origin);
  }
}
