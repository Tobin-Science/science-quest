// =====================================================================
// Shared helpers for the Science Quest standalone backend.
// (Same proven style as the hub's api/_shared.js: Web-standard handlers,
//  Stripe + service-role Supabase, env-var'd so test->live needs no code
//  change.)
// =====================================================================
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const PRICE_QUEST = process.env.STRIPE_PRICE_QUEST;
export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export const SITE_ORIGIN = process.env.SITE_ORIGIN || '';

// Service-role Supabase client — server only, bypasses RLS. The Quest
// tables have no public policies, so ALL access goes through this.
export function adminDb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}

// CORS: allow the live Quest site + localhost during testing.
const ALLOWED = [SITE_ORIGIN, 'http://localhost:5190', 'http://127.0.0.1:5190'].filter(Boolean);
export function corsHeaders(origin) {
  const allow = ALLOWED.includes(origin) ? origin : (SITE_ORIGIN || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

export function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

// A long, URL-safe secret for the private dashboard link.
export function genToken() {
  return crypto.randomBytes(24).toString('base64url');
}

// Student codes like 'QUEST-7K2PX'. Deliberately avoids look-alike
// characters (no O/0, I/1, L) so kids type them correctly. 5 chars over a
// 31-char alphabet = ~28.6 million combos, so the pool stays sparse even
// with hundreds of thousands of codes (collisions stay negligible).
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHA[crypto.randomInt(ALPHA.length)];
  return 'QUEST-' + s;
}
// 150 codes unique within the batch. The DB also enforces global
// uniqueness (code is the primary key); the webhook retries on the rare
// cross-owner collision.
export function genCodes(n) {
  const set = new Set();
  while (set.size < n) set.add(makeCode());
  return [...set];
}

// The PRIVATE Storage bucket holding the protected assets (game,
// leaderboard, guide). Files are never public — access is only ever a
// short-lived signed URL handed out after a valid code/token.
export const QUEST_BUCKET = 'quest';
export async function signAsset(db, path, seconds) {
  const { data, error } = await db.storage.from(QUEST_BUCKET).createSignedUrl(path, seconds);
  if (error || !data) return null;   // file missing / not uploaded yet
  return data.signedUrl;
}
