# ─────────────────────────────────────────────────────────────────────────────
# Cronos Studio v7.1 — Multi-stage Dockerfile
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ git
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Stage 2: Builder — compile frontend + generate Prisma client
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate 2>/dev/null || true

# Build Vite frontend
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 studio

# Runtime dependencies only
COPY --from=deps    /app/node_modules              ./node_modules
COPY --from=builder /app/dist                      ./dist
COPY --from=builder /app/prisma                    ./prisma
COPY --from=builder /app/server                    ./server
COPY --from=builder /app/server.ts                 ./server.ts
COPY --from=builder /app/packages                  ./packages
COPY --from=builder /app/services                  ./services
COPY --from=builder /app/package.json              ./package.json
COPY --from=builder /app/tsconfig.json             ./tsconfig.json
COPY --from=builder /app/tsconfig.server.json      ./tsconfig.server.json

# Generated Prisma client (critical — must be copied from builder)
COPY --from=builder /app/node_modules/.prisma      ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma      ./node_modules/@prisma

# Uploads directory
RUN mkdir -p uploads && chown studio:nodejs uploads

USER studio

EXPOSE 3000

# Run migrations then start server
CMD sh -c "npx prisma migrate deploy 2>/dev/null || npx prisma db push --skip-generate 2>/dev/null || true && node --import tsx/esm server.ts"
