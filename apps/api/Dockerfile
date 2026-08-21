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
