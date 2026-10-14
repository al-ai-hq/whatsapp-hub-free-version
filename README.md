# WhatsApp Hub Free

**Self-hosted WhatsApp messaging for your business.**

[العربية](./README.ar.md) | **English**

WhatsApp Hub Free is a self-hosted messaging platform built on the **Meta Cloud API**. Upload contacts, build templates, send broadcasts, and manage two-way conversations — all from your own infrastructure.

## Features

- **Your data stays yours** — fully self-hosted, your data under your control, ideal for local compliance (Saudi PDPL, UAE DPL, Jordan, etc.)
- **Contact upload & broadcast** — import contacts via CSV, send bulk messages through approved templates
- **Two-way inbox** — live conversations with 24-hour service window tracking, supporting text, images, documents, voice, video, stickers, and reactions
- **Rich template builder** — media headers, coupon codes, carousel displays, interactive buttons (quick reply / URL / call / copy code)
- **Recurring campaigns** — schedule one-time or recurring campaigns with UTC scheduling
- **Detailed analytics** — delivery funnel, read rates, button event tracking
- **Retry failed sends** — re-queue only the failed recipients from any broadcast

## Tech Stack

Next.js (App Router) · TypeScript strict · Prisma + PostgreSQL · BullMQ + Redis · Docker Compose

## Prerequisites

1. A **WhatsApp Business Account (WABA)** from Meta + a phone number
2. At least one **approved message template**
3. A **permanent access token** (System User token) + **App Secret** + **Phone Number ID** + **WABA ID**
4. **PostgreSQL 16+** and **Redis 7+** (provided via Docker Compose)

## Quick Start (Docker)

```bash
cp .env.example .env                          # fill in WA_* and META_APP_SECRET
node scripts/hash-password.mjs 'YourPassword' # copy output → ADMIN_PASSWORD_HASH
#   also set ADMIN_EMAIL and a long AUTH_JWT_SECRET (>=32 chars)
docker compose up --build                     # postgres, redis, app (runs migrations), worker
```

On first launch you'll be redirected to **/login**. Sign in with `ADMIN_EMAIL` + your password.

- App: http://localhost:3000
- Health: http://localhost:3000/api/health

## Usage Flow

0. **Configure WhatsApp** — go to Settings → WhatsApp Connection, paste Phone Number ID, Business Account ID, App ID, access token, and app secret, then **Test Connection**
1. **Sync templates** — `GET /api/templates?sync=1`
2. **Upload contacts** — `POST /api/contacts/upload` (CSV format)
3. **Create a broadcast** — `POST /api/broadcasts`
4. **Monitor progress** in the dashboard. Incoming **STOP** messages auto-unsubscribe contacts

## Templates

Create templates at **/templates** and submit them to Meta for approval:

- **Media header** — image / PDF / video
- **Body** with `{{variables}}` + optional **footer**
- **Buttons** (up to 3): quick reply / URL / **call** / **copy code** (coupon)
- **Carousel** — 2-10 media cards

## Recurring Campaigns

Powered by `RecurringCampaign` + BullMQ scheduler. The worker re-syncs active schedules on startup. All schedules run in **UTC**.

## Development (without Docker)

```bash
npm install
npm run prisma:migrate -- --name init
npm run dev          # web on :3000
npm run worker:dev   # worker (separate terminal)
```

## Testing

```bash
npm run typecheck    # tsc strict
npm test             # vitest
npm run test:e2e     # playwright
```

## Deploy

### Railway (one-click)

See **RAILWAY.md**. 4 components: Postgres, Redis, **web**, **worker**.

### Self-hosted (Docker)

```bash
docker compose up --build -d
```

### Serverless option

Run `app` on Vercel; Postgres → Neon/Supabase, Redis → Upstash. **The worker must stay on a persistent host** (Railway/Fly/VM).

## Scaling

- Increase `WA_MPS` **only after** Meta upgrades your rate tier
- Run multiple `worker` containers — BullMQ distributes tasks across them

## Webhook Setup

In Meta App Dashboard → WhatsApp → Configuration:

- **Callback URL:** `https://YOUR_DOMAIN/api/webhooks/whatsapp`
- **Verify token:** your verification token
- Subscribe to **messages** events

## License

[MIT License](./LICENSE) — open source, 100% free
