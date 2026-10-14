# Task 1 Brief: Project Scaffold

**Project:** whatsapp-hub-free at `/tmp/whatsapp-hub-free/`
**BASE commit:** 127ee85aab2940c459632fad391c425090d96d1c

## What to build

Create the project scaffold files with exact content from the plan. This is a fresh Next.js 15 project with Prisma, BullMQ, Redis, JWT auth foundations.

## Files to create (exact content)

### 1. `package.json`
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

### 2. `tsconfig.json`
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

### 3. `next.config.mjs`
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

### 4. `.env.example`
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

### 5. `src/lib/env.ts`
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

### 6. `src/lib/db.ts`
```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### 7. `vitest.config.ts`
```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { setupFiles: ["vitest.setup.ts"] },
});
```

### 8. `vitest.setup.ts`
```ts
process.env.SKIP_ENV_VALIDATION = "1";
```

### 9. `.gitignore` — Standard Next.js gitignore:
```
node_modules/
.next/
out/
.env
.env.local
.env.*.local
*.tsbuildinfo
next-env.d.ts
.DS_Store
```

### 10. `.dockerignore`
```
node_modules
.next
.git
.env
.env.*
*.md
.superpowers/
docs/
```

## Verification

1. Run `npm install` — must succeed
2. Run `SKIP_ENV_VALIDATION=1 npx tsc --noEmit` — must pass with zero errors
3. Commit: `git add -A && git commit -m "chore: project scaffold with env validation and Prisma client"`

## Report

Write your report to: `/tmp/whatsapp-hub-free/.superpowers/sdd/whatsapp-hub-free/task-1-report.md`

Include: status (DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED), commits created, test/typecheck output, any concerns.
