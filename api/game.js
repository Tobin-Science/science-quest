// =====================================================================
// GET /api/game?code=QUEST-XXXXX
// Serves the protected game to a valid code, always with the correct
// HTML content-type (so it runs as a page, not shown as text). The code
// is the credential; the file is streamed from the private bucket and
// never exposed as a public URL.
// =====================================================================
import { adminDb, QUEST_BUCKET, stripe, SITE_ORIGIN, verify1v1Pass } from './_shared.js';

// ---- 1v1 Science: build a self-contained single-game download ----
const ES_SHEETS = ['energy_sources','moon_phases','planets','rocks','sky_icons','space_objects'];
async function fetchDataURI(url, mime) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return 'data:' + mime + ';base64,' + buf.toString('base64');
}
// Reads the (public) grade page + compressed art, inlines everything, and
// bakes in single-game mode so the file boots into that one game offline.
async function build1v1File(grade, game, std, name) {
  const base = SITE_ORIGIN || '';
  const r = await fetch(base + '/1v1/' + grade + '.html');
  if (!r.ok) return null;
  let html = await r.text();
  const logo = await fetchDataURI(base + '/1v1/dl/tobin-logo.png', 'image/png');
  if (logo) html = html.split('assets/tobin-logo.png').join(logo);
  if (grade === 'earth') {
    for (const n of ES_SHEETS) {
      const u = await fetchDataURI(base + '/1v1/dl/es/' + n + '.jpg', 'image/jpeg');
      if (u) html = html.split('assets/es/' + n + '.png').join(u);
    }
  }
  const cfg = '<script>window.__ONLY_GAME__=' + JSON.stringify({ id: game, std: std || null }) + ';</script>';
  html = html.replace('<body>', '<body>\n' + cfg);
  const filename = (name || 'game').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.html';
  return { body: html, filename };
}
async function deliver1v1(sid) {
  let session;
  try { session = await stripe.checkout.sessions.retrieve(sid); }
  catch (e) { return note('We could not verify that purchase. If you were charged, re-send your link from <a href="/1v1/recover.html" style="color:#f4e4bc">tobinscience.com/1v1/recover.html</a>.'); }
  if (!session || session.payment_status !== 'paid' || !session.metadata || session.metadata.product !== '1v1_game') {
    return note('That purchase is not complete yet. If you were charged, re-send your link from <a href="/1v1/recover.html" style="color:#f4e4bc">tobinscience.com/1v1/recover.html</a>.');
  }
  const { grade, game, std, name } = session.metadata;
  const file = await build1v1File(grade, game, std, name);
  if (!file) return note('Something went wrong building your download. Please try again in a few minutes, or re-send your link from <a href="/1v1/recover.html" style="color:#f4e4bc">tobinscience.com/1v1/recover.html</a>.');
  return new Response(file.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + file.filename + '"',
      'Cache-Control': 'no-store'
    }
  });
}

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

    // 1v1 Science single-game download after a paid $2 checkout.
    const sid = url.searchParams.get('s');
    if (sid) return await deliver1v1(sid);

    // 1v1 Science free download with a verified Cherokee all-access pass.
    const pass = url.searchParams.get('pass');
    if (pass) {
      const email = verify1v1Pass(pass);
      if (!email || !email.endsWith('@cherokeek12.net')) {
        return note('This free-access pass is invalid or has expired. Request a fresh one at <a href="/1v1/cherokee.html" style="color:#f4e4bc">tobinscience.com/1v1/cherokee.html</a>.');
      }
      const grade = (url.searchParams.get('grade') || '').toLowerCase();
      const game = (url.searchParams.get('game') || '').slice(0, 40);
      const std = (url.searchParams.get('std') || '').slice(0, 8);
      const name = (url.searchParams.get('name') || 'Game').slice(0, 60);
      if (!['physical', 'life', 'earth'].includes(grade) || !game) return note('That game could not be found.');
      const file = await build1v1File(grade, game, std, name);
      if (!file) return note('Something went wrong building your download. Please try again in a few minutes.');
      return new Response(file.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'attachment; filename="' + file.filename + '"',
          'Cache-Control': 'no-store'
        }
      });
    }

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
