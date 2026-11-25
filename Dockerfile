# One Cloud Run service for the whole app: the Fastify API also serves the built React app on the same domain.
# Build and deploy: see "Deploy on Cloud Run" in README.md.

# ---- build: install everything, compile shared, API and web ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
# The browser gets the Supabase URL and anon key at run time from the server (WEB_DIST + SUPABASE_ANON_KEY),
# so the image does not depend on a Supabase project. The web app calls the API on its own domain.
ENV VITE_API_URL=""
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund \
 && rm -rf apps/web/src apps/api/src packages/shared/src

# ---- run: only compiled code and production dependencies ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    WEB_DIST=/app/apps/web/dist
COPY --from=build --chown=node:node /app /app
USER node
# Cloud Run sets PORT (8080 by default); the server listens on 0.0.0.0.
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/api/dist/server.js"]
