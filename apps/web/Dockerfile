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
