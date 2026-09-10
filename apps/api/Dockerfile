FROM node:20.19.4-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# The lock file is the source of truth for a reproducible API image.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY apps/web-admin/package.json ./apps/web-admin/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci --include=dev \
  && mkdir -p /app/storage/uploads

COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

RUN npm run prisma:generate \
  && chown -R node:node /app

USER node
EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=35s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "start", "-w", "apps/api"]
