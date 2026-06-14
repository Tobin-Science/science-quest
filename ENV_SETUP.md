# Science Quest — environment variables

These go in the Vercel project's settings (and a local `.env` if testing
locally). All are env-var'd so the test -> live switch needs no code change.

## Now (TEST / sandbox mode)
| Variable | Value | Where it comes from |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` | Stripe sandbox → Developers → API keys (SECRET — Derek adds) |
| `STRIPE_PRICE_QUEST` | `price_1Ti2iZAPcWvNGQnVOnouIP3P` | the test product we made |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | created when we register the webhook (Stripe → Webhooks) |
| `SUPABASE_URL` | `https://fmbdoxfkjldvpkyryqlx.supabase.co` | same project as the hub |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_…` | Supabase → Project settings → API (SECRET — Derek adds) |
| `SITE_ORIGIN` | the Quest site URL (e.g. `https://science-quest.vercel.app`) | set after the Vercel project exists |

## At launch (LIVE mode) — Phase 5
Swap to: `STRIPE_SECRET_KEY` = `sk_live_…`, `STRIPE_PRICE_QUEST` = the LIVE
price id, `STRIPE_WEBHOOK_SECRET` = the LIVE webhook secret. Everything else
stays the same.

## Endpoints
- `POST /api/create-checkout` — starts the $19.99 one-time checkout.
- `POST /api/webhook` — Stripe → us; on purchase, makes the owner + 150 codes.
  Register in Stripe for the single event **checkout.session.completed**.
