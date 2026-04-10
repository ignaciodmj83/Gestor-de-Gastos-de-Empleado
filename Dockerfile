# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Only copy what's needed to run
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY tsconfig.json ./
COPY firebase-applet-config.json ./

# Run the Express server (serves dist/ + /api endpoints)
# Cloud Run sets PORT=8080 automatically
CMD ["npx", "tsx", "server.ts"]

EXPOSE 8080
