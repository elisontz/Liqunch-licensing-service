# Deployment Notes

This service is intended to be deployed as a standalone Cloudflare Worker on:

- `https://olauncher-licensing-service.elisonyang2024.workers.dev`

## 1. Create the D1 database

```bash
wrangler d1 create olauncher-licenses
```

Copy the returned database ID into [`wrangler.toml`](./wrangler.toml).

## 2. Apply the schema

```bash
wrangler d1 execute olauncher-licenses --file=./migrations/0001_initial.sql
```

## 3. Set real Paddle values

Update [`wrangler.toml`](./wrangler.toml):

- `PADDLE_SINGLE_PRICE_ID`
- `PADDLE_DOUBLE_PRICE_ID`

Then set the Paddle webhook secret as a Worker secret:

```bash
wrangler secret put PADDLE_WEBHOOK_SECRET
```

## 4. Install dependencies

```bash
npm install
```

## 5. Deploy

```bash
npm run deploy
```

## 6. Connect Paddle webhook

Point Paddle webhook delivery to:

- `https://olauncher-licensing-service.elisonyang2024.workers.dev/api/paddle/webhooks`

This endpoint now verifies the `Paddle-Signature` header against the raw request body before processing events.

The current implementation supports these event intents:

- successful transaction => create license
- refund / chargeback adjustment => revoke license

## 7. Manual backfill during early rollout

Until Paddle is fully live, you can also seed licenses directly in D1 for local testing.
