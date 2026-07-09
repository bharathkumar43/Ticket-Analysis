FROM node:20-alpine AS builder
WORKDIR /app

# Install ALL deps (TypeScript, ts-node needed for build)
COPY package*.json ./
RUN npm ci

COPY . .
# Generate Prisma client and compile TypeScript
RUN npx prisma generate && npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy Prisma schema + migrations (needed for migrate deploy at startup)
COPY prisma ./prisma

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist

# Copy Prisma generated client from builder (avoids re-generating at runtime)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# prisma CLI binary (needed for migrate deploy)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

EXPOSE 3600

# Run migrations then start the server
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/src/server.js"]
