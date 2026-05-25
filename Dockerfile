# syntax=docker/dockerfile:1
# Single-image deploy: builds the web app, then the Hono API serves both the
# JSON API (/api/*) and the built SPA on one port.

# ---- build the web app ----
FROM node:18-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:18-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    SERVE_STATIC=apps/web/dist \
    DB_FILE=/data/data.sqlite
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/dist ./apps/web/dist
VOLUME /data
EXPOSE 8080
CMD ["node_modules/.bin/tsx", "apps/api/src/index.ts"]
