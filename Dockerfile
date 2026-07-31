# Builds natively on the Mac mini's arm64 Docker Desktop.
#
# The engine and server ship as TypeScript source: Node strips the types at
# load, so there is no build step for them and no bundler to disagree with the
# type checker. Only the web bundle is compiled.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci --omit=dev --workspace @goleta/server --include-workspace-root \
    && npm cache clean --force

COPY packages/engine/src packages/engine/src
COPY packages/server/src packages/server/src
COPY --from=build /app/packages/web/dist packages/web/dist

# Room snapshots live here; docker-compose mounts a named volume over it.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

ENV PORT=8063 HOST=0.0.0.0 DATA_DIR=/app/data
EXPOSE 8063

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8063/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/server/src/index.ts"]
