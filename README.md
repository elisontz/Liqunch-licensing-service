# oLauncher Licensing Service

Minimal Cloudflare Workers + D1 service for `email + license` activation.

Recommended production hostname:

- `https://olauncher-licensing-service.elisonyang2024.workers.dev`

## Endpoints

- `GET /health`
- `POST /api/licenses/activate`
- `POST /api/licenses/validate`
- `POST /api/licenses/deactivate`
- `POST /api/paddle/webhooks`

## Local setup

1. Create a D1 database:
   - `wrangler d1 create olauncher-licenses`
2. Replace `database_id` in [`wrangler.toml`](./wrangler.toml).
3. Apply the initial schema:
   - `wrangler d1 execute olauncher-licenses --file=./migrations/0001_initial.sql`
4. Install dependencies:
   - `npm install`
5. Start local dev:
   - `npm run dev`

## Required config

Set these values in [`wrangler.toml`](./wrangler.toml) or through Wrangler environments:

- `LICENSE_KEY_PREFIX`
- `PADDLE_SINGLE_PRICE_ID`
- `PADDLE_DOUBLE_PRICE_ID`
- `PADDLE_WEBHOOK_SECRET` (Wrangler secret, not a public var)

## Notes

- The webhook handler now verifies the `Paddle-Signature` header against the raw request body before mutating license state.
- Paddle webhook events should be sent to:
  - `https://olauncher-licensing-service.elisonyang2024.workers.dev/api/paddle/webhooks`
- The service still assumes Paddle event payloads include a transaction identifier, customer email, and a resolvable price ID.
- Before production use, add outbound email delivery for newly created licenses.
