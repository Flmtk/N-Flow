# N-Flow · Bauen und Betreiben in einem Image
FROM node:22-alpine AS bau
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=bau /app/server/node_modules ./server/node_modules
COPY --from=bau /app/server/dist ./server/dist
COPY server/package.json ./server/
COPY server/migrations ./server/migrations
COPY web ./web
ARG APP_VERSION=0.1.0
ENV APP_VERSION=${APP_VERSION}
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server/dist/server.js"]
