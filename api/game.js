// =====================================================================
// GET /api/game?code=QUEST-XXXXX
// Serves the protected game to a valid code, always with the correct
// HTML content-type (so it runs as a page, not shown as text). The code
// is the credential; the file is streamed from the private bucket and
// never exposed as a public URL.
// =====================================================================
import { adminDb, QUEST_BUCKET } from './_shared.js';

function toPlay() {
  return new Response(null, { status: 302, headers: { Location: '/play.html' } });
}
function note(message) {
  return new Response(
    '<!doctype html><meta charset="utf-8"><body style="font-family:Georgia,serif;background:#2a2520;color:#f4e4bc;text-align:center;padding:60px 24px">' +
    message + '</body>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const code = (url.searchParams.get('code') || '').trim().toUpperCase();
    if (!code) return toPlay();

    const db = adminDb();
    const { data: row, error } = await db.from('quest_codes')
      .select('code, activated_at').eq('code', code).maybeSingle();
    if (error) throw error;
    if (!row) return toPlay();

    // Claim the seat if they came straight here (idempotent).
    if (!row.activated_at) {
      await db.from('quest_codes').update({ activated_at: new Date().toISOString() }).eq('code', code);
    }

    const { data: file, error: dErr } = await db.storage.from(QUEST_BUCKET).download('game.html');
    if (dErr || !file) return note('The game is being set up — please check back shortly.');

    const body = await file.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Cache per-code so reloads are instant and cheap; short enough that
        // a game update reaches students within the hour.
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (e) {
    return note('Something went wrong loading the game. Please try again.');
  }
}
