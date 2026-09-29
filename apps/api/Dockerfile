FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache openssl
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter @dogfood/api exec prisma generate \
 && pnpm --filter @dogfood/api build

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/server.js"]
