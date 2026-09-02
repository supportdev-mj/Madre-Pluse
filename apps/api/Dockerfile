FROM node:20-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm install --workspace=apps/api --workspace=packages/shared --include-workspace-root

FROM deps AS dev
COPY . .
RUN npm run build --workspace=packages/shared
WORKDIR /app/apps/api
RUN npx prisma generate
EXPOSE 4000
CMD ["npm", "run", "start:dev"]

# ---- production build (compiles TS, needs the full/dev dependency set from `deps`) ----
FROM deps AS build
COPY . .
RUN npm run build --workspace=packages/shared
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

# ---- production dependencies only (no devDependencies) ----
FROM base AS prod-deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm install --workspace=apps/api --workspace=packages/shared --include-workspace-root --omit=dev

# ---- production runtime image ----
# Not wired into docker-compose.yml (that's for local dev only) — this is what CI/CD
# builds and pushes to ECR for the ECS Fargate service. See docs/DEVELOPER.md's AWS
# deployment notes for how migrations are applied (a separate one-off task, not on boot).
FROM base AS prod
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
WORKDIR /app/apps/api
RUN npx prisma generate
USER node
EXPOSE 4000
# tsconfig.json's `include` covers both src/**/*.ts and prisma/seed.ts, so tsc infers
# the package root (not src/) as rootDir — compiled output keeps the src/ prefix.
CMD ["node", "dist/src/main.js"]
