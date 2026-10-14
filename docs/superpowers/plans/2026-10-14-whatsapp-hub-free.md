# WhatsApp Hub Free — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted, single-user WhatsApp messaging tool — contact management, broadcasts, two-way inbox, templates, and recurring campaigns — with zero multi-tenancy.

**Architecture:** Next.js 15 App Router + Prisma 6 + PostgreSQL 16 + BullMQ 5 + Redis 7. Web and worker are separate processes sharing one database. Single admin authenticates via JWT. All WhatsApp Cloud API calls go through a single config row (no per-client lookup).

**Tech Stack:** Next.js 15, TypeScript strict, Prisma 6, BullMQ 5, ioredis 5, jose (JWT), bcryptjs, zod, React 19, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-10-14-whatsapp-hub-free-design.md`

## Global Constraints

- No `clientId` field on any model — single-user only
- No roles (SUPERADMIN/ADMIN/MEMBER) — single admin
- No host-tenant binding or subdomain routing
- WhatsAppConfig is a single row (id="default")
- All env validation skippable via `SKIP_ENV_VALIDATION=1` at build time
- Docker image serves both web (`next start`) and worker (`tsx src/worker/index.ts`)
- MIT license

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `.dockerignore`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/lib/db.ts`
- Create: `src/lib/env.ts`

**Interfaces:**
- Produces: `env` object (validated env vars), `prisma` singleton

- [ ] **Step 1: Create package.json**

```json
{
  "name": "whatsapp-hub-free",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "worker": "tsx src/worker/index.ts",
    "worker:dev": "tsx watch src/worker/index.ts",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "seed:admin": "node scripts/seed-admin.mjs",
    "cleanup:stuck": "tsx scripts/cleanup-stuck-broadcasts.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@prisma/client": "^6.2.1",
    "bcryptjs": "^2.4.3",
    "bullmq": "^5.34.0",
    "ioredis": "5.10.1",
    "jose": "^5.9.6",
    "next": "^15.1.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^22.10.5",
    "@types/react": "^19.0.4",
    "prisma": "^6.2.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.mjs**

```js
/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Create .env.example**

```
# ─── WhatsApp Cloud API ──────────────────────────────────────────────
GRAPH_API_VERSION=v21.0
WA_PHONE_NUMBER_ID=000000000000000
WA_BUSINESS_ACCOUNT_ID=000000000000000
WA_ACCESS_TOKEN=EAAG...your-permanent-system-user-token
META_APP_SECRET=your-app-secret
WA_WEBHOOK_VERIFY_TOKEN=choose-a-long-random-string
WA_APP_ID=
WA_MPS=80
OPT_OUT_KEYWORDS=STOP,UNSUBSCRIBE,الغاء

# ─── Infrastructure ──────────────────────────────────────────────────
DATABASE_URL=postgresql://wa:wa_password@localhost:5432/whatsapp_hub_free?schema=public
REDIS_URL=redis://localhost:6379

# ─── Auth ────────────────────────────────────────────────────────────
AUTH_JWT_SECRET=generate-a-64-char-random-string-here-min-32-chars
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=$2a$12$replace.with.bcrypt.hash
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
LOGIN_RATE_MAX=5
LOGIN_RATE_WINDOW=300

# ─── App ─────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000
```

- [ ] **Step 5: Create src/lib/env.ts**

```ts
import { z } from "zod";

const EnvSchema = z.object({
  GRAPH_API_VERSION: z.string().default("v21.0"),
  WA_PHONE_NUMBER_ID: z.string().min(1),
  WA_BUSINESS_ACCOUNT_ID: z.string().min(1),
  WA_APP_ID: z.string().default(""),
  WA_ACCESS_TOKEN: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  WA_WEBHOOK_VERIFY_TOKEN: z.string().min(1),
  WA_MPS: z.coerce.number().int().positive().default(80),
  OPT_OUT_KEYWORDS: z.string().default("STOP,UNSUBSCRIBE"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  AUTH_JWT_SECRET: z.string().min(32, "AUTH_JWT_SECRET must be ≥32 chars"),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD_HASH: z.string().min(1),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),
  LOGIN_RATE_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_WINDOW: z.coerce.number().int().positive().default(300),
});

export const env = process.env.SKIP_ENV_VALIDATION
  ? (process.env as unknown as z.infer<typeof EnvSchema>)
  : EnvSchema.parse(process.env);

export const optOutKeywords = (env.OPT_OUT_KEYWORDS || "STOP,UNSUBSCRIBE")
  .split(",")
  .map((k) => k.trim().toUpperCase())
  .filter(Boolean);
```

- [ ] **Step 6: Create src/lib/db.ts**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 7: Create vitest.config.ts and vitest.setup.ts**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { setupFiles: ["vitest.setup.ts"] },
});
```

```ts
// vitest.setup.ts
process.env.SKIP_ENV_VALIDATION = "1";
```

- [ ] **Step 8: Create .gitignore and .dockerignore**

Standard Next.js .gitignore (node_modules, .next, .env, etc.) and .dockerignore (node_modules, .next, .git, etc.)

- [ ] **Step 9: Install dependencies and verify typecheck**

Run: `npm install && npx tsc --noEmit`
Expected: Clean install, no type errors (empty project)

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "chore: project scaffold with env validation and Prisma client"
```

---

## Task 2: Prisma Schema + Migration

**Files:**
- Create: `prisma/schema.prisma`

**Interfaces:**
- Produces: All Prisma models, generates `@prisma/client` types

- [ ] **Step 1: Create prisma/schema.prisma**

Write the full schema from the design spec (Section 3). All 15 models: User, WhatsAppConfig, Contact, ContactList, ContactListSnapshot, ContactListMembership, Template, Broadcast, BroadcastRecipient, MessageEvent, RecurringCampaign, AuditLog, Conversation, Message, OptOut, RedirectLink. No `Client` model, no `clientId` fields.

- [ ] **Step 2: Generate Prisma client**

Run: `npx prisma generate`
Expected: Client generated, types available

- [ ] **Step 3: Start Postgres and create initial migration**

Run: `docker compose up postgres -d && npx prisma migrate dev --name init`
Expected: Migration created and applied, all tables exist

- [ ] **Step 4: Verify schema**

Run: `npx prisma db push --force-reset` (only in dev)
Expected: Schema in sync, no drift

- [ ] **Step 5: Commit**

```bash
git add prisma/ && git commit -m "feat: Prisma schema — 15 models, no multi-tenancy"
```

---

## Task 3: Auth System

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/users.ts`
- Create: `src/lib/tokenStore.ts`
- Create: `src/lib/ratelimit.ts`
- Create: `src/middleware.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/refresh/route.ts`
- Create: `src/app/api/auth/me/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/logout-all/route.ts`
- Create: `src/app/api/auth/change-password/route.ts`
- Create: `scripts/hash-password.mjs`
- Create: `scripts/seed-admin.mjs`

**Interfaces:**
- Consumes: `env` from `src/lib/env.ts`, `prisma` from `src/lib/db.ts`
- Produces: `signAccess(sub)`, `signRefresh(sub, ver, jti)`, `verifyToken(token, typ)`, `ACCESS_COOKIE`, `REFRESH_COOKIE`, `cookieBase`

- [ ] **Step 1: Create src/lib/auth.ts**

```ts
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "./env";

const secret = new TextEncoder().encode(env.AUTH_JWT_SECRET);

export const ACCESS_COOKIE = "at";
export const REFRESH_COOKIE = "rt";
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7d
export const ACCESS_MAX_AGE = 60 * 15; // 15m

export interface AccessClaims extends JWTPayload {
  sub: string;
  typ: "access";
}

export interface RefreshClaims extends JWTPayload {
  sub: string;
  typ: "refresh";
  ver: number;
  jti: string;
}

export type AuthClaims = AccessClaims | RefreshClaims;

export async function signAccess(sub: string): Promise<string> {
  return new SignJWT({ typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(secret);
}

export async function signRefresh(sub: string, ver: number, jti: string): Promise<string> {
  return new SignJWT({ typ: "refresh", ver })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(env.REFRESH_TOKEN_TTL)
    .sign(secret);
}

export async function verifyToken(
  token: string | undefined,
  typ: "access" | "refresh",
): Promise<AuthClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<AuthClaims>(token, secret);
    if (payload.typ !== typ) return null;
    return payload;
  } catch {
    return null;
  }
}

export const cookieBase = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
```

- [ ] **Step 2: Create src/lib/tokenStore.ts**

Refresh token rotation with reuse detection (same pattern as wa-broadcast but without clientId). Uses Redis to store `{ jti → { sub, ver, family } }` with TTL = REFRESH_TTL_SECONDS.

- [ ] **Step 3: Create src/lib/users.ts**

```ts
import { prisma } from "./db";
import { verifyToken, type AccessClaims } from "./auth";
import bcrypt from "bcryptjs";

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email, tokenVersion: user.tokenVersion };
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
}

export async function changePassword(userId: string, newPassword: string) {
  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hash, tokenVersion: { increment: 1 } },
  });
}

export async function getAccessContext(claims: AccessClaims) {
  const user = await prisma.user.findUnique({ where: { email: claims.sub } });
  if (!user) return null;
  return { email: user.email, id: user.id };
}
```

- [ ] **Step 4: Create src/lib/ratelimit.ts**

Simple Redis-backed rate limiter for login attempts. Key: `login:${email}`, max `LOGIN_RATE_MAX` attempts per `LOGIN_RATE_WINDOW` seconds.

- [ ] **Step 5: Create src/middleware.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, ACCESS_COOKIE } from "@/lib/auth";

const PUBLIC_PREFIXES = [
  "/login", "/api/auth", "/api/webhooks", "/api/health", "/go",
];
const PUBLIC_EXACT = new Set(["/", "/contacts-template.csv"]);

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

- [ ] **Step 6: Create auth API routes**

Each route follows the simplified pattern — no clientId, no roles:
- `POST /api/auth/login` — verify credentials, rate-limited, issue JWT pair
- `POST /api/auth/refresh` — rotate refresh token, detect reuse → revoke family
- `GET /api/auth/me` — return `{ email }` from access token
- `POST /api/auth/logout` — clear cookies + revoke current jti
- `POST /api/auth/logout-all` — bump tokenVersion, clear cookies
- `PUT /api/auth/change-password` — verify old password, set new, bump version

- [ ] **Step 7: Create scripts/hash-password.mjs and seed-admin.mjs**

```js
// scripts/hash-password.mjs
import bcrypt from "bcryptjs";
const hash = await bcrypt.hash(process.argv[2], 12);
console.log(hash);
```

```js
// scripts/seed-admin.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const existing = await prisma.user.count();
if (existing === 0) {
  await prisma.user.create({
    data: {
      email: process.env.ADMIN_EMAIL,
      passwordHash: process.env.ADMIN_PASSWORD_HASH,
    },
  });
  console.log("Admin seeded:", process.env.ADMIN_EMAIL);
} else {
  console.log("Users exist, skipping seed");
}
await prisma.$disconnect();
```

- [ ] **Step 8: Test auth flow**

Run: `npm run seed:admin` (with env vars set)
Expected: Admin user created in database

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth.ts src/lib/users.ts src/lib/tokenStore.ts src/lib/ratelimit.ts src/middleware.ts src/app/api/auth/ scripts/ && git commit -m "feat: single-admin auth system with JWT + refresh rotation"
```

---

## Task 4: WhatsApp Config + Core Libs

**Files:**
- Create: `src/lib/waConfig.ts`
- Create: `src/lib/whatsapp.ts`
- Create: `src/lib/phone.ts`
- Create: `src/lib/validation.ts`
- Create: `src/lib/webhookSig.ts`
- Create: `src/lib/conversations.ts`
- Create: `src/lib/audit.ts`
- Create: `src/app/api/settings/whatsapp/route.ts`
- Create: `src/app/api/settings/whatsapp/test/route.ts`
- Create: `src/app/api/health/route.ts`

**Interfaces:**
- Consumes: `prisma`, `env`
- Produces: `getWaConfig()`, `saveWaConfig(patch)`, `sendTemplate(args)`, `sendText(args)`, `sendMedia(args)`, `sendReadReceipt(wamid)`, `fetchMediaBytes(mediaId)`, `uploadMedia(...)`, `createTemplate(input)`, `syncTemplates()`, `recordInboundMessage(...)`, `logAudit(...)`

- [ ] **Step 1: Create src/lib/waConfig.ts**

Single-config version — no clientId parameter:

```ts
import { prisma } from "./db";
import { env } from "./env";

export interface WaConfig {
  phoneNumberId: string;
  businessAccountId: string;
  appId: string;
  accessToken: string;
  appSecret: string;
  webhookVerifyToken: string;
  graphApiVersion: string;
}

export async function getWaConfig(): Promise<WaConfig> {
  const row = await prisma.whatsAppConfig.findUnique({ where: { id: "default" } }).catch(() => null);
  return {
    phoneNumberId: row?.phoneNumberId || env.WA_PHONE_NUMBER_ID,
    businessAccountId: row?.businessAccountId || env.WA_BUSINESS_ACCOUNT_ID,
    appId: row?.appId || env.WA_APP_ID,
    accessToken: row?.accessToken || env.WA_ACCESS_TOKEN,
    appSecret: row?.appSecret || env.META_APP_SECRET,
    webhookVerifyToken: row?.webhookVerifyToken || env.WA_WEBHOOK_VERIFY_TOKEN,
    graphApiVersion: row?.graphApiVersion || env.GRAPH_API_VERSION,
  };
}

export async function saveWaConfig(
  patch: Partial<Record<keyof WaConfig, string | undefined>>,
): Promise<void> {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "string" && v.trim()) data[k] = v.trim();
  }
  await prisma.whatsAppConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
}

export async function getWaConfigStatus(): Promise<{
  phoneNumberId: string;
  businessAccountId: string;
  appId: string;
  webhookVerifyToken: string;
  graphApiVersion: string;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  savedAt: string | null;
}> {
  const row = await prisma.whatsAppConfig.findUnique({ where: { id: "default" } }).catch(() => null);
  const cfg = await getWaConfig();
  return {
    phoneNumberId: row?.phoneNumberId ?? "",
    businessAccountId: row?.businessAccountId ?? "",
    appId: row?.appId ?? "",
    webhookVerifyToken: row?.webhookVerifyToken ?? "",
    graphApiVersion: row?.graphApiVersion || env.GRAPH_API_VERSION,
    hasAccessToken: Boolean(cfg.accessToken),
    hasAppSecret: Boolean(cfg.appSecret),
    savedAt: row?.updatedAt.toISOString() ?? null,
  };
}
```

- [ ] **Step 2: Create src/lib/whatsapp.ts**

Copy from wa-broadcast but remove all `clientId` parameters from function signatures. `getWaConfig()` is called with no arguments. Functions: `buildTemplatePayload`, `sendTemplate`, `sendText`, `sendReadReceipt`, `fetchMediaBytes`, `uploadMedia`, `sendMedia`, `createTemplate`, `uploadTemplateMedia`, `uploadTemplateMediaFromUrl`, `buildTemplateComponents`, `countTemplateVars`, `syncTemplates`.

- [ ] **Step 3: Create utility libs**

- `src/lib/phone.ts` — E.164 normalization (copy from wa-broadcast, no changes needed)
- `src/lib/validation.ts` — Zod schemas for API inputs (copy, remove any clientId references)
- `src/lib/webhookSig.ts` — HMAC-SHA256 verification (copy, no changes needed)
- `src/lib/conversations.ts` — `recordInboundMessage(phone, message)` — no clientId param
- `src/lib/audit.ts` — `logAudit(actor, action, target?, meta?)` — no clientId

- [ ] **Step 4: Create settings + health API routes**

- `GET/PUT /api/settings/whatsapp` — get/save config (no clientId)
- `POST /api/settings/whatsapp/test` — test connection
- `GET /api/health` — return `{ status: "ok" }`

- [ ] **Step 5: Write tests for phone validation and webhook signature**

```ts
// src/lib/phone.test.ts
import { describe, it, expect } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("strips leading + and spaces", () => {
    expect(normalizePhone("+962 5X XXX XXX")).toBe("9625XXXXXXX");
  });
  it("rejects empty input", () => {
    expect(() => normalizePhone("")).toThrow();
  });
});
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/lib/waConfig.ts src/lib/whatsapp.ts src/lib/phone.ts src/lib/validation.ts src/lib/webhookSig.ts src/lib/conversations.ts src/lib/audit.ts src/app/api/settings/ src/app/api/health/ && git commit -m "feat: WhatsApp config, API client, and utility libs"
```

---

## Task 5: Contact Management

**Files:**
- Create: `src/app/api/contacts/route.ts`
- Create: `src/app/api/contacts/[id]/route.ts`
- Create: `src/app/api/contacts/upload/route.ts`
- Create: `src/app/api/contacts/bulk-delete/route.ts`
- Create: `src/app/api/contacts/bulk-list/route.ts`

**Interfaces:**
- Consumes: `prisma`, `normalizePhone`, `optOutKeywords`
- Produces: Contact CRUD endpoints, CSV upload, bulk operations

- [ ] **Step 1: Create contacts CRUD routes**

All routes follow the pattern: no `getClientId()`, no `where: { clientId }`. Direct Prisma queries.

- `GET /api/contacts` — list with pagination, search by name/phone
- `POST /api/contacts` — create single contact (phone + name + attributes)
- `GET /api/contacts/[id]` — get one contact
- `PATCH /api/contacts/[id]` — update contact
- `DELETE /api/contacts/[id]` — delete contact

- [ ] **Step 2: Create CSV upload route**

`POST /api/contacts/upload` — multipart form with CSV file. Parse rows, normalize phones, upsert contacts. Return counts (created, updated, skipped).

- [ ] **Step 3: Create bulk operation routes**

- `POST /api/contacts/bulk-delete` — delete multiple contacts by IDs
- `POST /api/contacts/bulk-list` — add/remove contacts from lists

- [ ] **Step 4: Commit**

```bash
git add src/app/api/contacts/ && git commit -m "feat: contact management — CRUD, CSV upload, bulk ops"
```

---

## Task 6: Contact Lists + Snapshots

**Files:**
- Create: `src/app/api/lists/route.ts`
- Create: `src/app/api/lists/[id]/route.ts`
- Create: `src/app/api/lists/[id]/snapshots/route.ts`
- Create: `src/app/api/lists/[id]/snapshots/[snapshotId]/restore/route.ts`
- Create: `src/lib/snapshots.ts`
- Create: `src/lib/listDeletion.ts`

- [ ] **Step 1: Create list CRUD routes**

No clientId scoping. Direct queries on ContactList.

- [ ] **Step 2: Create snapshot lib and routes**

`src/lib/snapshots.ts` — `takeSnapshot(listId, reason)` and `restoreSnapshot(snapshotId)`.
Routes for listing snapshots and restoring.

- [ ] **Step 3: Create list deletion lib**

`src/lib/listDeletion.ts` — archive logic (soft-delete, keeps broadcast history).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/lists/ src/lib/snapshots.ts src/lib/listDeletion.ts && git commit -m "feat: contact lists with snapshots and archive"
```

---

## Task 7: Template Management

**Files:**
- Create: `src/app/api/templates/route.ts`
- Create: `src/app/api/templates/media/route.ts`
- Create: `src/lib/templatePreview.ts`
- Create: `src/lib/carousel.ts`

- [ ] **Step 1: Create template routes**

- `GET /api/templates` — list templates, optional `?sync=1` to pull from Meta
- `POST /api/templates` — create template and submit to Meta
- `POST /api/templates/media` — upload media header sample

- [ ] **Step 2: Create template utility libs**

- `src/lib/templatePreview.ts` — render template body with variables for preview
- `src/lib/carousel.ts` — resolve carousel card media URLs

- [ ] **Step 3: Write tests**

Tests for `templatePreview` and `carousel` (copy from wa-broadcast, remove clientId references).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/templates/ src/lib/templatePreview.ts src/lib/carousel.ts && git commit -m "feat: template management with Meta sync"
```

---

## Task 8: Broadcast Engine

**Files:**
- Create: `src/lib/queue.ts`
- Create: `src/lib/broadcast.ts`
- Create: `src/lib/broadcastStatus.ts`
- Create: `src/lib/jobId.ts`
- Create: `src/lib/stuckBroadcasts.ts`
- Create: `src/app/api/broadcasts/route.ts`
- Create: `src/app/api/broadcasts/[id]/route.ts`
- Create: `src/app/api/broadcasts/[id]/retry/route.ts`

**Interfaces:**
- Consumes: `prisma`, `sendQueue`, `sendTemplate`, `getWaConfig`
- Produces: `createAndEnqueueBroadcast(opts)` (no clientId), broadcast CRUD endpoints

- [ ] **Step 1: Create queue.ts**

```ts
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export interface SendJob {
  broadcastId: string;
  recipientId: string;
  to: string;
  templateName: string;
  language: string;
  bodyParams: string[];
  headerFormat?: string | null;
  headerMediaUrl?: string | null;
  couponCode?: string | null;
  carouselCards?: { format: string; mediaUrl: string }[] | null;
  ltoExpiryMs?: number | null;
}

export const SEND_QUEUE = "wa-send";

export const sendQueue = new Queue<SendJob>(SEND_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});
```

- [ ] **Step 2: Create broadcast.ts**

Copy from wa-broadcast but remove `clientId` from:
- `createAndEnqueueBroadcast(opts)` — remove `opts.clientId`, remove all `where: { clientId }` filters
- Template lookup: `where: { id: opts.templateId }` (no clientId)
- List lookup: `where: { id: opts.listId }` (no clientId)
- Opt-out lookup: `prisma.optOut.findMany({})` (no clientId)
- Membership lookup: `where: { listId: opts.listId }` (no `list: { clientId }`)
- Contact filter: remove `c.clientId === opts.clientId`
- Broadcast create: remove `clientId: opts.clientId`
- Send job: remove `clientId` from job data

- [ ] **Step 3: Create supporting libs**

- `src/lib/broadcastStatus.ts` — status transition logic
- `src/lib/jobId.ts` — deterministic BullMQ job IDs
- `src/lib/stuckBroadcasts.ts` — cleanup for stuck broadcasts

- [ ] **Step 4: Create broadcast API routes**

- `GET /api/broadcasts` — list broadcasts
- `POST /api/broadcasts` — create and enqueue broadcast
- `GET /api/broadcasts/[id]` — get broadcast with recipients
- `PATCH /api/broadcasts/[id]` — update broadcast
- `POST /api/broadcasts/[id]/retry` — retry failed recipients

- [ ] **Step 5: Write tests**

Tests for `broadcastStatus` and `jobId` (copy from wa-broadcast).

- [ ] **Step 6: Commit**

```bash
git add src/lib/queue.ts src/lib/broadcast.ts src/lib/broadcastStatus.ts src/lib/jobId.ts src/lib/stuckBroadcasts.ts src/app/api/broadcasts/ && git commit -m "feat: broadcast engine — create, enqueue, send, retry"
```

---

## Task 9: Two-Way Inbox

**Files:**
- Create: `src/app/api/conversations/route.ts`
- Create: `src/app/api/conversations/[id]/route.ts`
- Create: `src/app/api/conversations/[id]/messages/route.ts`
- Create: `src/app/api/conversations/[id]/template/route.ts`
- Create: `src/app/api/conversations/[id]/media/route.ts`
- Create: `src/lib/inboundMessage.ts`

- [ ] **Step 1: Create conversation routes**

All without clientId:
- `GET /api/conversations` — list conversations, sorted by lastMessageAt
- `GET /api/conversations/[id]` — get conversation with messages
- `PATCH /api/conversations/[id]` — mark as read
- `POST /api/conversations/[id]/messages` — send text message
- `POST /api/conversations/[id]/template` — send template message
- `POST /api/conversations/[id]/media` — send media message

- [ ] **Step 2: Create inbound message lib**

`src/lib/inboundMessage.ts` — normalize inbound webhook messages into Conversation + Message rows.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/conversations/ src/lib/inboundMessage.ts && git commit -m "feat: two-way inbox — conversations, messages, media"
```

---

## Task 10: Webhook Handler

**Files:**
- Create: `src/app/api/webhooks/whatsapp/route.ts`
- Create: `src/app/api/media/[id]/route.ts`
- Create: `src/app/api/leads/route.ts`
- Create: `src/app/go/[slug]/route.ts`

- [ ] **Step 1: Create webhook handler**

Simplified from wa-broadcast:
- GET: webhook verification (compare token against `getWaConfig().webhookVerifyToken`)
- POST: process events
  - Template status updates → update Template.status
  - Delivery/read receipts → update BroadcastRecipient.status + create MessageEvent
  - Inbound messages → `recordInboundMessage()` (no client routing)
  - Opt-out keywords → create OptOut, mark Contact.optedOut
- HMAC verification using single `getWaConfig().appSecret`

- [ ] **Step 2: Create media proxy route**

`GET /api/media/[id]` — fetch media from Meta, serve to browser (token-safe).

- [ ] **Step 3: Create leads + redirect routes**

- `POST /api/leads` — public lead capture (creates Contact)
- `GET /go/[slug]` — redirect link handler

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/ src/app/api/media/ src/app/api/leads/ src/app/go/ && git commit -m "feat: webhook handler, media proxy, leads, redirects"
```

---

## Task 11: Recurring Campaigns

**Files:**
- Create: `src/lib/recurring.ts`
- Create: `src/app/api/recurring/route.ts`
- Create: `src/app/api/recurring/[id]/route.ts`

- [ ] **Step 1: Create recurring lib**

`src/lib/recurring.ts` — BullMQ scheduler queue for cron-based campaigns. `syncSchedules()` registers active campaigns, `unscheduleAll()` removes all.

- [ ] **Step 2: Create recurring API routes**

- `GET /api/recurring` — list campaigns
- `POST /api/recurring` — create campaign
- `GET /api/recurring/[id]` — get campaign
- `PATCH /api/recurring/[id]` — update (pause/resume)
- `DELETE /api/recurring/[id]` — delete campaign

- [ ] **Step 3: Commit**

```bash
git add src/lib/recurring.ts src/app/api/recurring/ && git commit -m "feat: recurring campaigns with cron scheduling"
```

---

## Task 12: Audit Log + Redirects

**Files:**
- Create: `src/app/api/audit/route.ts`
- Create: `src/app/api/redirects/route.ts`
- Create: `src/app/api/redirects/[id]/route.ts`
- Create: `src/lib/links.ts`

- [ ] **Step 1: Create audit + redirect routes**

- `GET /api/audit` — list audit logs (paginated)
- `GET/POST /api/redirects` — list/create redirect links
- `PATCH/DELETE /api/redirects/[id]` — update/delete redirect
- `src/lib/links.ts` — slug generation utilities

- [ ] **Step 2: Commit**

```bash
git add src/app/api/audit/ src/app/api/redirects/ src/lib/links.ts && git commit -m "feat: audit log and redirect links"
```

---

## Task 13: Worker Process

**Files:**
- Create: `src/worker/index.ts`
- Create: `scripts/cleanup-stuck-broadcasts.ts`

- [ ] **Step 1: Create worker**

```ts
// src/worker/index.ts
import { Worker } from "bullmq";
import { connection, SEND_QUEUE, type SendJob } from "@/lib/queue";
import { sendTemplate } from "@/lib/whatsapp";
import { prisma } from "@/lib/db";
import { syncSchedules } from "@/lib/recurring";

async function processSend(job: { data: SendJob }) {
  const { broadcastId, recipientId, to, templateName, language, bodyParams, headerFormat, headerMediaUrl, couponCode, carouselCards, ltoExpiryMs } = job.data;

  const wamid = await sendTemplate({
    to, templateName, language, bodyParams,
    headerFormat, headerMediaUrl, couponCode, carouselCards, ltoExpiryMs,
  });

  await prisma.broadcastRecipient.update({
    where: { id: recipientId },
    data: { wamid, status: "SENT" },
  });

  // Increment sent count
  await prisma.broadcast.update({
    where: { id: broadcastId, status: "SENDING" },
    data: { sentCount: { increment: 1 } },
  });
}

const worker = new Worker<SendJob>(SEND_QUEUE, processSend, {
  connection,
  limiter: {
    max: (await import("@/lib/env")).env.WA_MPS,
    duration: 1000,
  },
});

worker.on("failed", async (job, err) => {
  if (!job) return;
  const retryable = err.name === "WhatsAppError" && (err as any).retryable;
  if (!retryable || job.attemptsMade >= job.opts.attempts!) {
    await prisma.broadcastRecipient.update({
      where: { id: job.data.recipientId },
      data: { status: "FAILED", error: err.message },
    });
    await prisma.broadcast.update({
      where: { id: job.data.broadcastId },
      data: { failedCount: { increment: 1 } },
    });
  }
});

// Sync recurring campaign schedules on boot
await syncSchedules();

console.log("Worker started, processing queue:", SEND_QUEUE);
```

- [ ] **Step 2: Create cleanup script**

`scripts/cleanup-stuck-broadcasts.ts` — find broadcasts stuck in SENDING for >1hr, mark as FAILED.

- [ ] **Step 3: Commit**

```bash
git add src/worker/ scripts/cleanup-stuck-broadcasts.ts && git commit -m "feat: BullMQ worker for send jobs + recurring scheduler"
```

---

## Task 14: UI — Layout, Login, Nav

**Files:**
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/components/Nav.tsx`
- Create: `src/components/LogoutButton.tsx`
- Create: `src/components/ThemeToggle.tsx`
- Create: `src/components/LangToggle.tsx`
- Create: `src/lib/apiFetch.ts`
- Create: `src/lib/useRole.ts` (simplified — just returns `{ email }`)

- [ ] **Step 1: Create globals.css**

Copy design system from wa-broadcast (globals.css, components.css, design-system.css, states.css). No changes needed — the CSS tokens are tenant-agnostic.

- [ ] **Step 2: Create layout.tsx**

Root layout with HTML shell, fonts (Inter + Arabic font), metadata.

- [ ] **Step 3: Create page.tsx (root redirect)**

Redirect to /dashboard if logged in, /login if not.

- [ ] **Step 4: Create login page**

Email + password form. On success, redirect to /dashboard. On error, show message.

- [ ] **Step 5: Create Nav component**

Simplified nav — no ClientSwitcher, no role badges. Just: Logo, nav links (Dashboard, Inbox, Settings), theme toggle, language toggle, logout button.

- [ ] **Step 6: Create apiFetch.ts**

Client-side fetch wrapper. On 401, try refresh, then retry. On refresh failure, redirect to /login.

- [ ] **Step 7: Create useRole.ts (simplified)**

```ts
// src/lib/useRole.ts
import { useEffect, useState } from "react";

interface Me {
  email: string;
}

let cached: Me | null = null;
let promise: Promise<Me> | null = null;

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(cached);
  useEffect(() => {
    if (cached) { setMe(cached); return; }
    if (!promise) {
      promise = fetch("/api/auth/me").then((r) => r.json()).then((d) => { cached = d; return d; });
    }
    promise.then(setMe);
  }, []);
  return me;
}
```

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css src/app/components.css src/app/design-system.css src/app/states.css src/app/layout.tsx src/app/page.tsx src/app/login/ src/components/Nav.tsx src/components/LogoutButton.tsx src/components/ThemeToggle.tsx src/components/LangToggle.tsx src/lib/apiFetch.ts src/lib/useRole.ts && git commit -m "feat: UI shell — layout, login, nav, theme toggle"
```

---

## Task 15: UI — Dashboard + Feature Pages

**Files:**
- Create: `src/app/dashboard/page.tsx`
- Create: `src/components/Dashboard.tsx` (or inline in page)
- Create: `src/components/ContactsTable.tsx`
- Create: `src/components/UploadForm.tsx`
- Create: `src/components/AddContactForm.tsx`
- Create: `src/components/ListsManager.tsx`
- Create: `src/components/NewListForm.tsx`
- Create: `src/components/BroadcastForm.tsx`
- Create: `src/components/LiveProgress.tsx`
- Create: `src/components/TemplatesManager.tsx`
- Create: `src/components/WaPreview.tsx`
- Create: `src/components/CampaignsManager.tsx`
- Create: `src/components/RedirectsManager.tsx`
- Create: `src/components/AuditLogViewer.tsx`
- Create: `src/components/WhatsAppSetup.tsx`
- Create: `src/components/ChangePasswordForm.tsx`
- Create: `src/components/InboxClient.tsx`
- Create: `src/components/SidebarLayout.tsx`
- Create: `src/components/ui.ts`
- Create: `src/app/contacts/page.tsx`
- Create: `src/app/lists/page.tsx`
- Create: `src/app/templates/page.tsx`
- Create: `src/app/broadcasts/[id]/page.tsx`
- Create: `src/app/campaigns/page.tsx`
- Create: `src/app/inbox/page.tsx`
- Create: `src/app/settings/page.tsx`

- [ ] **Step 1: Port dashboard page**

Copy dashboard from wa-broadcast, remove all `getClientIdFromCookies()` calls and `where: { clientId }` filters.

- [ ] **Step 2: Port feature components**

Copy each component from wa-broadcast. For each:
1. Remove any `clientId` references
2. Remove role-based conditional rendering (no `me.isAdmin` checks — admin is the only user)
3. Remove ClientSwitcher imports

Key components: ContactsTable, BroadcastForm, TemplatesManager, CampaignsManager, InboxClient, WhatsAppSetup, ListsManager, etc.

- [ ] **Step 3: Port page routes**

Create page.tsx for each route (contacts, lists, templates, broadcasts/[id], campaigns, inbox, settings). Each is a thin wrapper that renders the corresponding component.

- [ ] **Step 4: Create settings page**

Settings page with: WhatsApp connection setup, change password, audit log viewer. No "Clients" panel, no "Team" panel.

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: Zero errors

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/ src/app/contacts/ src/app/lists/ src/app/templates/ src/app/broadcasts/ src/app/campaigns/ src/app/inbox/ src/app/settings/ src/components/ && git commit -m "feat: full UI — dashboard, contacts, broadcasts, inbox, templates, campaigns, settings"
```

---

## Task 16: Docker + Railway Config

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `railway.json`
- Create: `railway.worker.json`

- [ ] **Step 1: Create Dockerfile**

Copy from wa-broadcast — 3-stage build (deps, build, runtime). No changes needed.

- [ ] **Step 2: Create docker-compose.yml**

Copy from wa-broadcast, change database name to `whatsapp_hub_free`.

- [ ] **Step 3: Create Railway configs**

Copy `railway.json` and `railway.worker.json` from wa-broadcast. No changes needed.

- [ ] **Step 4: Verify Docker build**

Run: `docker compose build`
Expected: Image builds successfully

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml railway.json railway.worker.json && git commit -m "feat: Docker + Railway deployment config"
```

---

## Task 17: README + License + Distribution

**Files:**
- Create: `LICENSE` (MIT)
- Create: `README.md`
- Create: `README.ar.md`
- Create: `sample-contacts.csv`
- Create: `.github/workflows/ci.yml`
- Create: `.github/ISSUE_TEMPLATE/bug-report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature-request.yml`

- [ ] **Step 1: Create MIT LICENSE**

Standard MIT license, year 2026, author "WhatsApp Hub Free Contributors".

- [ ] **Step 2: Create README.md**

Positioning: "Self-hosted WhatsApp messaging for your business." Cover: features, quick start (Docker), prerequisites, usage flow, deploy options (Railway, self-hosted), development.

- [ ] **Step 3: Create README.ar.md**

Arabic translation of README.

- [ ] **Step 4: Create CI workflow**

GitHub Actions: typecheck + test on push/PR.

- [ ] **Step 5: Create issue templates**

Bug report and feature request YAML templates.

- [ ] **Step 6: Create sample-contacts.csv**

Sample CSV for testing imports.

- [ ] **Step 7: Final verification**

Run: `npm run typecheck && npm test && docker compose build`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add LICENSE README.md README.ar.md sample-contacts.csv .github/ && git commit -m "docs: README, license, CI, issue templates"
```

---

## Task 18: Landing Page

**Files:**
- Create: `public/index.html` (GitHub Pages landing)

- [ ] **Step 1: Create landing page**

Bilingual HTML landing page showcasing the product. Features, screenshots, quick start, links to repo.

- [ ] **Step 2: Commit**

```bash
git add public/index.html && git commit -m "docs: GitHub Pages landing page"
```
