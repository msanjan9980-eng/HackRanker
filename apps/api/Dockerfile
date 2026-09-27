FROM node:22-alpine AS build
WORKDIR /repo
RUN apk add --no-cache openssl libc6-compat
COPY package.json ./
COPY apps/api/package.json apps/api/
RUN npm install --workspaces --include-workspace-root --no-audit --no-fund
COPY apps/api apps/api
RUN npm -w apps/api run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache wget openssl libc6-compat
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/apps/api/dist /app/dist
COPY --from=build /repo/apps/api/package.json /app/package.json
EXPOSE 3000
CMD ["node", "dist/server.js"]