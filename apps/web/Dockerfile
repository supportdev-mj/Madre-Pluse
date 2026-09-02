FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm install --workspace=apps/web --workspace=packages/shared --include-workspace-root

FROM deps AS dev
COPY . .
RUN npm run build --workspace=packages/shared
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---- production build ----
# NEXT_PUBLIC_* vars are inlined into the JS bundle at build time, not read at container
# runtime — pass them as --build-arg (e.g. --build-arg NEXT_PUBLIC_API_URL=https://api.example.com)
# or they silently default to the localhost dev values below.
FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
COPY . .
RUN npm run build --workspace=packages/shared
WORKDIR /app/apps/web
RUN npm run build

# ---- production runtime image ----
# Uses Next.js's `output: 'standalone'` (see next.config.js): the build step traces
# actual imports and produces a self-contained server + pruned node_modules, so this
# stage doesn't need its own dependency install at all. Static assets and /public are
# deliberately excluded from the standalone trace and must be copied in separately —
# that's a well-documented Next.js monorepo gotcha, not an oversight here.
# Not wired into docker-compose.yml (local dev only) — see docs/DEVELOPER.md AWS notes.
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
