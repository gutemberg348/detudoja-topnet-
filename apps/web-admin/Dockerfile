FROM node:20.19.4-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY apps/web-admin/package.json ./apps/web-admin/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci --include=dev

COPY apps/web-admin ./apps/web-admin

# Empty means same origin: Nginx below proxies /api and /socket.io to the API.
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build -w apps/web-admin

FROM nginx:1.27-alpine

COPY apps/web-admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web-admin/dist /usr/share/nginx/html

EXPOSE 80
