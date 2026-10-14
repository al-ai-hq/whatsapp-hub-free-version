# syntax=docker/dockerfile:1
# ── Stage 1: deps ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── Stage 2: build ───────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Skip env validation at build time — real secrets are injected at runtime
# (compose env_file / Railway service variables).
ENV SKIP_ENV_VALIDATION=1
RUN npx prisma generate && npm run build

# ── Stage 3: runtime ─────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/src ./src
COPY --from=build --chown=app:app /app/scripts ./scripts
COPY --from=build --chown=app:app /app/package.json ./package.json

USER app
# Informational; the app listens on $PORT. Railway's default is 8080, so the
# fallback is 8080 (compose sets PORT=3000 explicitly for local).
EXPOSE 8080

# Health check hits the app's /api/health endpoint on the runtime port.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-8080}/api/health" || exit 1

# Default = web. next start binds 0.0.0.0:$PORT (Railway injects PORT; 8080 local
# fallback is overridden by compose's PORT=3000). railway.json/compose override.
CMD ["npm", "run", "start"]
