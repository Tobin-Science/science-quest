// =====================================================================
// GET /api/teacher-file?token=...&asset=leaderboard|guide
// Serves a teacher-only protected file (Hall of Champions leaderboard or
// the Strategy Guide PDF) with the correct content-type, only for a
// verified owner. Like /api/game, this stamps the right type every time.
// =====================================================================
import { adminDb, QUEST_BUCKET } from './_shared.js';

const FILES = {
  leaderboard: { path: 'leaderboard.html', type: 'text/html; charset=utf-8' },
  guide:       { path: 'guide.pdf',        type: 'application/pdf' }
};

function msg(text, status) {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';
    const f = FILES[url.searchParams.get('asset') || ''];
    if (!token || !f) return msg('Invalid request.', 400);

    const db = adminDb();
    const { data: owner } = await db.from('quest_owners')
      .select('id').eq('access_token', token).maybeSingle();
    if (!owner) return msg('This link is not valid.', 403);

    const { data: file, error } = await db.storage.from(QUEST_BUCKET).download(f.path);
    if (error || !file) return msg('That file is not available yet.', 404);

    const body = await file.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': f.type, 'Cache-Control': 'private, max-age=300' }
    });
  } catch (e) {
    return msg('Something went wrong.', 500);
  }
}
