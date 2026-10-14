# whatsapp-hub-free — Design Spec

**Date:** 2026-10-14
**Status:** Design — awaiting approval
**Approach:** SDLC (clean build informed by wa-broadcast, not a fork-and-strip)

## 1. Product Definition

**whatsapp-hub-free** is a self-hosted, single-user WhatsApp messaging tool for small businesses in Jordan and the GCC. One admin, one WhatsApp number, one database. MIT licensed.

### Core features (all from wa-broadcast, redesigned for single-user):
1. **Contact management** — CSV upload, manual add, inline edit, bulk delete, opt-out tracking
2. **Broadcast** — Pick approved template + contact list, variable substitution, scheduling, retry-failed, analytics funnel
3. **Two-way inbox** — Receive/reply to WhatsApp messages, 24h service window, media attachments, read receipts
4. **Template builder** — Create templates with media headers, body variables, footer, buttons (quick-reply, URL, call, copy-code, carousel), submit to Meta for approval
5. **Recurring campaigns** — Cron-based scheduled broadcasts, pause/resume

### What this is NOT:
- Not a SaaS platform (no multi-tenancy)
- Not a team tool (no roles, no invites)
- Not a white-label product

### Target user:
A small business owner or operator who self-hosts this on Railway or a VPS to manage their own WhatsApp communications.

---

## 2. Architecture

### Stack
- **Framework:** Next.js 15 (App Router) + TypeScript strict
- **Database:** PostgreSQL 16 via Prisma 6
- **Queue:** BullMQ 5 + Redis 7 (worker process)
- **Auth:** JWT (jose) — single admin, password login
- **Deployment:** Docker Compose (dev + prod), Railway (cloud)
- **Styling:** Tailwind CSS + custom design tokens

### Process topology
```
┌─────────────┐     ┌──────────────┐     ┌──────────┐
│  Next.js     │────▶│  PostgreSQL  │     │  Redis   │
│  (web :3000) │     └──────────────┘     └────┬─────┘
└─────────────┘                                 │
                                                │
┌─────────────┐     ┌──────────────┐            │
│  Worker      │────▶│  PostgreSQL  │◀───────────┘
│  (tsx)       │     └──────────────┘
└─────────────┘
```

Web and worker are separate processes sharing one database. The worker polls BullMQ queues for send jobs and recurring campaign triggers.

### Key design decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Schema | No `clientId` anywhere | Single-user — the concept doesn't exist |
| Auth | Single admin, no roles | No team management needed |
| WhatsApp config | Single row, no per-client lookup | One number per install |
| Webhooks | Direct processing, no WABA-to-client routing | One WABA per install |
| Worker jobs | No `clientId` in job data | Config loaded from env/DB directly |
| Middleware | Auth-only check, no host-tenant binding | No subdomains, no tenants |

---

## 3. Database Schema

Clean Prisma schema — no `Client` model, no `clientId` fields.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  tokenVersion Int      @default(1)  // bump to revoke all refresh tokens
  createdAt    DateTime @default(now())
}

model WhatsAppConfig {
  id                 String   @id @default("default")
  phoneNumberId      String?
  businessAccountId  String?
  appId              String?
  accessToken        String?
  appSecret          String?
  webhookVerifyToken String?
  graphApiVersion    String?
  updatedAt          DateTime @updatedAt
}

model Contact {
  id         String   @id @default(cuid())
  phone      String   @unique  // E.164 without '+'
  name       String?
  attributes Json     @default("{}")
  optedOut   Boolean  @default(false)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  memberships   ContactListMembership[]
  recipients    BroadcastRecipient[]
  conversations Conversation[]

  @@index([optedOut])
}

model ContactList {
  id        String   @id @default(cuid())
  name      String   @unique
  archived  Boolean  @default(false)
  createdAt DateTime @default(now())

  memberships ContactListMembership[]
  broadcasts  Broadcast[]
  snapshots   ContactListSnapshot[]
}

model ContactListSnapshot {
  id          String      @id @default(cuid())
  list        ContactList @relation(fields: [listId], references: [id], onDelete: Cascade)
  listId      String
  listName    String
  memberIds   Json
  memberCount Int
  reason      String      @default("manual")
  createdAt   DateTime    @default(now())

  @@index([listId])
}

model ContactListMembership {
  contact   Contact     @relation(fields: [contactId], references: [id], onDelete: Cascade)
  contactId String
  list      ContactList @relation(fields: [listId], references: [id], onDelete: Cascade)
  listId    String
  addedAt   DateTime    @default(now())

  @@id([contactId, listId])
  @@index([listId])
}

model Template {
  id            String   @id @default(cuid())
  name          String
  language      String   @default("en")
  category      String   // MARKETING | UTILITY | AUTHENTICATION
  variableCount Int      @default(0)
  headerFormat  String?  // IMAGE | DOCUMENT | VIDEO
  copyCode      Boolean  @default(false)
  ltoText       String?
  ltoExpiration Boolean  @default(false)
  cards         Json?
  bodyText      String?
  footerText    String?
  buttons       Json?
  status        String   @default("APPROVED")
  createdAt     DateTime @default(now())

  broadcasts Broadcast[]

  @@unique([name, language])
}

model Broadcast {
  id             String        @id @default(cuid())
  template       Template      @relation(fields: [templateId], references: [id])
  templateId     String
  list           ContactList   @relation(fields: [listId], references: [id])
  listId         String
  status         BroadcastStatus @default(DRAFT)
  totalCount     Int           @default(0)
  sentCount      Int           @default(0)
  failedCount    Int           @default(0)
  variableMap    Json          @default("[]")
  headerMediaUrl String?
  couponCode     String?
  cardMediaUrls  Json?
  ltoExpiresAt   DateTime?
  scheduledAt    DateTime?
  createdAt      DateTime      @default(now())
  startedAt      DateTime?
  completedAt    DateTime?

  recipients BroadcastRecipient[]

  @@index([status])
}

enum BroadcastStatus {
  DRAFT
  SCHEDULED
  QUEUED
  SENDING
  COMPLETED
  FAILED
}

model BroadcastRecipient {
  id          String          @id @default(cuid())
  broadcast   Broadcast       @relation(fields: [broadcastId], references: [id], onDelete: Cascade)
  broadcastId String
  contact     Contact         @relation(fields: [contactId], references: [id])
  contactId   String
  wamid       String?         @unique
  status      RecipientStatus @default(PENDING)
  error       String?
  updatedAt   DateTime        @updatedAt

  events MessageEvent[]

  @@unique([broadcastId, contactId])
  @@index([status])
}

enum RecipientStatus {
  PENDING
  SENT
  DELIVERED
  READ
  FAILED
}

model MessageEvent {
  id          String            @id @default(cuid())
  recipient   BroadcastRecipient? @relation(fields: [recipientId], references: [id])
  recipientId String?
  wamid       String?
  type        String  // status:sent|delivered|read|failed | inbound
  payload     Json
  createdAt   DateTime @default(now())

  @@index([wamid])
}

model RecurringCampaign {
  id          String   @id @default(cuid())
  name        String
  templateId  String
  listId      String
  variableMap Json     @default("[]")
  cron        String   // 5-field cron, UTC
  active      Boolean  @default(true)
  lastRunAt   DateTime?
  createdAt   DateTime @default(now())

  @@index([active])
}

model AuditLog {
  id        String   @id @default(cuid())
  actor     String   // user email
  action    String   // "broadcast.created", "contact.deleted", etc.
  target    String?
  meta      Json?
  createdAt DateTime @default(now())

  @@index([createdAt])
}

model Conversation {
  id            String    @id @default(cuid())
  phone         String    @unique
  contact       Contact?  @relation(fields: [contactId], references: [id], onDelete: SetNull)
  contactId     String?
  lastInboundAt DateTime?
  lastMessageAt DateTime  @default(now())
  lastPreview   String?
  unread        Int       @default(0)
  createdAt     DateTime  @default(now())

  messages Message[]

  @@index([lastMessageAt])
}

model Message {
  id             String       @id @default(cuid())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  conversationId String
  direction      String       // IN | OUT
  type           String       @default("text")
  text           String?
  mediaId        String?
  mediaMime      String?
  mediaFilename  String?
  wamid          String?      @unique
  status         String?      // SENT|DELIVERED|READ|FAILED
  error          String?
  createdAt      DateTime     @default(now())

  @@index([conversationId, createdAt])
  @@index([wamid])
}

model OptOut {
  id        String   @id @default(cuid())
  phone     String   @unique
  source    String   @default("keyword")
  createdAt DateTime @default(now())
}

model RedirectLink {
  id        String   @id @default(cuid())
  slug      String   @unique
  url       String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Schema changes from wa-broadcast (summary)
| Change | Models affected |
|--------|----------------|
| Remove `Client` model entirely | — |
| Remove `clientId` field | Contact, ContactList, Template, Broadcast, RecurringCampaign, AuditLog, User, WhatsAppConfig, Conversation, Message, OptOut, RedirectLink |
| Remove `role` field from User | User |
| Change `@@unique([clientId, phone])` → `@unique` on phone | Contact, OptOut, Conversation |
| Change `@@unique([clientId, name])` → `@unique` on name | ContactList |
| Change `@@unique([clientId, name, language])` → `@@unique([name, language])` | Template |
| Remove `slug`/`slugActive` from Client (model deleted) | — |
| Remove `@@index([clientId])` from all models | All |
| WhatsAppConfig uses `@id @default("default")` — single row | WhatsAppConfig |

---

## 4. Auth System

### Simplified auth flow
```
┌────────┐    POST /api/auth/login     ┌────────┐
│ Browser│    { email, password }       │  API   │
│        │─────────────────────────────▶│        │
│        │    Set-Cookie: at=<JWT>      │        │
│        │    Set-Cookie: rt=<JWT>      │        │
│        │◀─────────────────────────────│        │
│        │                              │        │
│        │    GET /api/auth/me          │        │
│        │    Cookie: at=<JWT>          │        │
│        │─────────────────────────────▶│        │
│        │    { email }                 │        │
│        │◀─────────────────────────────│        │
└────────┘                              └────────┘
```

### JWT claims (simplified)
```typescript
// Access token (15 min)
interface AccessClaims {
  sub: string;       // user email
  typ: "access";
}

// Refresh token (7 days)
interface RefreshClaims {
  sub: string;       // user email
  typ: "refresh";
  ver: number;       // token version (from User table)
  jti: string;       // rotation id (one-time use)
}
```

No `role`, no `cid`, no `slg`. The token just says "this is a valid session for this email."

### What gets removed
| File | Action |
|------|--------|
| `src/lib/tenancy.ts` | Delete entirely |
| `src/lib/hostTenancy.ts` | Delete entirely |
| `src/lib/hostClient.ts` | Delete entirely |
| `src/lib/rbac.ts` | Delete entirely |
| `src/lib/userAdmin.ts` | Delete entirely |
| `src/lib/auth.ts` | Rewrite: remove `ACTING_CLIENT_COOKIE`, `role`, `cid`, `slg` from claims; `signAccess` takes only `sub` |
| `src/lib/users.ts` | Rewrite: remove `getClientId()`, `contextFor()`, `requireAdmin()`, `requireSuperAdmin()`. Keep `verifySession()` that just checks "is logged in" |

### Bootstrap
```bash
# .env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=$2b$12$...  # bcrypt hash
AUTH_JWT_SECRET=<random-64-chars>
```

On first run, if the User table is empty, seed the admin from env vars. The admin can change their password from Settings.

---

## 5. Middleware

Simplified — just checks "is logged in" for protected routes.

```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

const PUBLIC_PREFIXES = [
  "/login", "/api/auth", "/api/webhooks", "/api/health",
  "/go",
];
const PUBLIC_EXACT = new Set([
  "/", "/contacts-template.csv",
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_EXACT.has(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const claims = await verifyToken(req.cookies.get(ACCESS_COOKIE)?.value, "access");
  if (claims) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

No host-tenant checking. No subdomain routing. No role verification.

---

## 6. API Routes

### Routes to delete entirely
| Route | Reason |
|-------|--------|
| `GET/POST /api/clients` | No client management |
| `POST /api/clients/switch` | No acting-client concept |
| `PATCH/DELETE /api/clients/[id]` | No client CRUD |
| `POST /api/clients/[id]/verify-host` | No subdomain verification |
| `GET/POST /api/users` | No team management |
| `PATCH/DELETE /api/users/[id]` | No user management |

### Routes to simplify (remove clientId)
All remaining routes follow the same pattern — remove `getClientId(req)` and the `where: { clientId }` filter.

**Example transformation:**

```typescript
// BEFORE (wa-broadcast)
export async function GET(req: Request) {
  const clientId = await getClientId(req);
  const contacts = await prisma.contact.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  return Response.json(contacts);
}

// AFTER (whatsapp-hub-free)
export async function GET() {
  const contacts = await prisma.contact.findMany({
    orderBy: { createdAt: "desc" },
  });
  return Response.json(contacts);
}
```

### Full route inventory (post-simplification)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/login` | POST | Email + password → JWT |
| `/api/auth/refresh` | POST | Rotate refresh token |
| `/api/auth/me` | GET | Current user info |
| `/api/auth/logout` | POST | Clear cookies |
| `/api/auth/password` | PUT | Change password |
| `/api/contacts` | GET, POST | List / add contact |
| `/api/contacts/[id]` | GET, PATCH, DELETE | Single contact |
| `/api/contacts/upload` | POST | CSV bulk import |
| `/api/contacts/bulk-delete` | POST | Multi-select delete |
| `/api/contacts/bulk-list` | POST | Add/remove from lists |
| `/api/lists` | GET, POST | List / create contact list |
| `/api/lists/[id]` | GET, PATCH, DELETE | Single list |
| `/api/lists/[id]/snapshots` | GET | List snapshots |
| `/api/lists/[id]/snapshots/[sid]/restore` | POST | Restore snapshot |
| `/api/templates` | GET, POST | List / create templates |
| `/api/templates/media` | POST | Upload media header |
| `/api/broadcasts` | GET, POST | List / create broadcast |
| `/api/broadcasts/[id]` | GET, PATCH | Single broadcast |
| `/api/broadcasts/[id]/retry` | POST | Retry failed recipients |
| `/api/conversations` | GET | List conversations |
| `/api/conversations/[id]` | GET | Single conversation |
| `/api/conversations/[id]/messages` | GET, POST | Messages in thread |
| `/api/conversations/[id]/template` | POST | Send template message |
| `/api/conversations/[id]/media` | POST | Send media message |
| `/api/recurring` | GET, POST | List / create campaign |
| `/api/recurring/[id]` | GET, PATCH, DELETE | Single campaign |
| `/api/redirects` | GET, POST | List / create redirect |
| `/api/redirects/[id]` | PATCH, DELETE | Single redirect |
| `/api/settings/whatsapp` | GET, PUT | WhatsApp config |
| `/api/audit` | GET | Audit log |
| `/api/health` | GET | Health check |
| `/api/webhooks/whatsapp` | GET, POST | Meta webhook handler |
| `/api/media/[id]` | GET | Proxy media download |
| `/api/leads` | POST | Public lead capture |

---

## 7. WhatsApp Config & Webhooks

### Config (simplified)
```typescript
// src/lib/waConfig.ts
// Single config row (id="default"). Values override env defaults.

export async function getWaConfig(): Promise<WaConfig> {
  const db = await prisma.whatsAppConfig.findUnique({ where: { id: "default" } });
  return {
    phoneNumberId: db?.phoneNumberId ?? env.WA_PHONE_NUMBER_ID,
    businessAccountId: db?.businessAccountId ?? env.WA_BUSINESS_ACCOUNT_ID,
    appId: db?.appId ?? env.WA_APP_ID,
    accessToken: db?.accessToken ?? env.WA_ACCESS_TOKEN,
    appSecret: db?.appSecret ?? env.META_APP_SECRET,
    webhookVerifyToken: db?.webhookVerifyToken ?? env.WA_VERIFY_TOKEN,
    graphApiVersion: db?.graphApiVersion ?? "v21.0",
  };
}

export async function saveWaConfig(patch: Partial<WaConfig>): Promise<void> {
  await prisma.whatsAppConfig.upsert({
    where: { id: "default" },
    update: patch,
    create: { id: "default", ...patch },
  });
}
```

No `clientId` parameter. No per-client lookup. No phone-number-to-client routing.

### Webhook handler (simplified)
```
Inbound webhook
  │
  ├─ Verify HMAC signature (using single appSecret)
  │
  ├─ Template status updates → update Template.status
  │
  ├─ Delivery/read receipts → update BroadcastRecipient.status
  │
  ├─ Inbound messages:
  │   ├─ Check for opt-out keywords (STOP, etc.)
  │   ├─ If opt-out → create OptOut, mark Contact.optedOut
  │   └─ If message → upsert Conversation, create Message
  │
  └─ Done (no client routing needed)
```

---

## 8. Worker & Queue

### Send queue
```typescript
// src/lib/queue.ts
export interface SendJob {
  broadcastId: string;
  recipientId: string;
  phone: string;
  templateName: string;
  templateLanguage: string;
  variables: string[];
  headerMediaUrl?: string;
  couponCode?: string;
  cardMediaUrls?: any[];
  ltoExpiresAt?: string;
}
// No clientId in job data — worker calls getWaConfig() directly.
```

### Worker
```typescript
// src/worker/index.ts
// Send worker: processes send jobs from BullMQ queue
// - Calls getWaConfig() for WhatsApp credentials
// - Sends via WhatsApp Cloud API
// - Updates BroadcastRecipient status
//
// Recurring worker: checks cron schedules, creates broadcasts
// - Reads RecurringCampaign rows
// - Creates Broadcast + enqueues send jobs
// - No clientId involved
```

---

## 9. UI Structure

### Pages
| Page | Route | Notes |
|------|-------|-------|
| Landing | `/` | Bilingual EN/AR, feature overview, CTA |
| Login | `/login` | Email + password form |
| Dashboard | `/dashboard` | Stats, recent broadcasts, quick actions |
| Contacts | `/contacts` (part of dashboard) | Import, add, edit, bulk delete |
| Inbox | `/inbox` | Two-pane conversation view |
| Templates | `/templates` (part of dashboard) | Create, submit, sync |
| Campaigns | `/campaigns` (part of dashboard) | Recurring schedules |
| Settings | `/settings` | WhatsApp connection, change password |

### Components to remove
| Component | Reason |
|-----------|--------|
| `ClientSwitcher.tsx` | No multi-tenancy |
| `ClientsManager.tsx` | No client management |
| `UsersManager.tsx` | No team management |
| Role badges in UI | No roles |

### Nav simplification
```
BEFORE: Logo | ClientSwitcher | Nav links | Role badge | Language toggle
AFTER:  Logo | Nav links | Language toggle
```

---

## 10. Files to delete (from wa-broadcast)

```
src/lib/tenancy.ts
src/lib/hostTenancy.ts
src/lib/hostClient.ts
src/lib/rbac.ts
src/lib/userAdmin.ts
src/components/ClientSwitcher.tsx
src/components/ClientsManager.tsx
src/components/UsersManager.tsx
src/app/api/clients/route.ts
src/app/api/clients/switch/route.ts
src/app/api/clients/[id]/route.ts
src/app/api/clients/[id]/verify-host/route.ts
src/app/api/users/route.ts
src/app/api/users/[id]/route.ts
e2e/tenant-isolation.spec.ts
```

---

## 11. Distribution & Branding

### Repo structure
```
whatsapp-hub-free/
├── prisma/
├── src/
├── public/
├── docs/                    # GitHub Pages landing
├── deploy/                  # Self-hosted Docker setup (from whatsapphub)
├── docker-compose.yml
├── Dockerfile
├── railway.json
├── railway.worker.json
├── LICENSE                  # MIT
├── README.md                # English (primary)
├── README.ar.md             # Arabic
├── .env.example
├── .github/
│   ├── workflows/ci.yml
│   └── ISSUE_TEMPLATE/
├── linkedin-post-ar.txt
├── linkedin-post-en.txt
├── twitter-thread-ar.txt
├── twitter-thread-en.txt
└── package.json
```

### README positioning
> **WhatsApp Hub Free** — Self-hosted WhatsApp messaging for your business.
> Upload contacts, send broadcasts, manage conversations, build templates.
> One install, one WhatsApp number, yours to keep.

### Key selling points
- MIT licensed — use it however you want
- Self-hosted — your data stays on your server
- Bilingual — Arabic + English UI
- No vendor lock-in — standard WhatsApp Cloud API
- Deploy in 10 minutes — Railway or Docker

---

## 12. SDLC Phases

| Phase | Deliverable | Exit criteria |
|-------|------------|---------------|
| **1. Requirements** | This spec doc | Spec approved |
| **2. Architecture** | Schema, API contracts, component map (this doc) | Design approved |
| **3. Implementation** | Working codebase | All features functional, typecheck passes |
| **4. Testing** | Unit + integration tests | Core flows tested |
| **5. Documentation** | README, setup guide, API docs | New user can deploy from README |
| **6. Distribution** | GitHub repo, landing page, social posts | Public, discoverable |

### Implementation order (Phase 3)
1. Project scaffold (package.json, tsconfig, next.config, tailwind)
2. Prisma schema + initial migration
3. Auth system (login, JWT, middleware)
4. WhatsApp config (getWaConfig, saveWaConfig)
5. Contact management (CRUD + CSV upload)
6. Contact lists (CRUD + snapshots)
7. Template management (CRUD + Meta sync)
8. Broadcast engine (create, enqueue, send, analytics)
9. Two-way inbox (conversations, messages, media)
10. Recurring campaigns (cron scheduler)
11. Audit log
12. Redirect links
13. Worker process
14. Docker Compose + Railway config
15. Landing page + README

---

## 13. Environment Variables

```bash
# Database
DATABASE_URL=postgresql://wa:wa_password@localhost:5432/whatsapp_hub_free

# Redis
REDIS_URL=redis://localhost:6379

# Auth
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=$2b$12$...
AUTH_JWT_SECRET=<random-64-chars>
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d

# WhatsApp Cloud API (defaults — overridable from Settings UI)
WA_PHONE_NUMBER_ID=
WA_BUSINESS_ACCOUNT_ID=
WA_ACCESS_TOKEN=
META_APP_SECRET=
WA_VERIFY_TOKEN=
WA_APP_ID=
WA_MPS=80

# App
PORT=3000
NODE_ENV=production
LOGIN_RATE_MAX=5
LOGIN_RATE_WINDOW=300

# Opt-out keywords (comma-separated)
OPT_OUT_KEYWORDS=STOP,UNSUBSCRIBE,CANCEL
```

---

## 14. Testing Strategy

| Layer | Tool | Coverage |
|-------|------|----------|
| Unit | Vitest | Payload builder, phone validation, cron parser |
| API | Vitest + supertest | Auth flow, CRUD operations, webhook handling |
| Integration | Docker Compose + Playwright | Full broadcast flow, inbox flow |
| Type safety | `tsc --noEmit` | Strict mode, zero errors |

---

## 15. Deployment

### Railway (recommended)
- 4 services: postgres, redis, app (web), worker
- Same config as wa-broadcast but without tenant complexity
- ~$5-15/mo

### Self-hosted (Docker)
- Use `deploy/` from whatsapphub as template
- Docker Compose: postgres, redis, migrate, app, worker, caddy, cloudflared
- Free on a $5 VPS

### Vercel (web only)
- Web on Vercel, worker on Railway/VPS
- Postgres on Neon/Supabase, Redis on Upstash
- More complex, not recommended for single-user
