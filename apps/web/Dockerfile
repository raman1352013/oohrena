# Multi-stage production Dockerfile for @oohrena/web
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN npm ci --legacy-peer-deps

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Public API origin, baked in at build time, e.g. --build-arg VITE_API_URL=https://api.oohrena.com
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
# The Lovable/nitro default target is Cloudflare Workers; a container needs the Node server output.
ENV NITRO_PRESET=node-server

RUN npm run build -w @oohrena/web

# Stage 2: Production runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

RUN apk add --no-cache curl

COPY --from=builder /app/apps/web/.output ./

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

CMD ["node", "server/index.mjs"]
