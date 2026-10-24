# Robot Rage: the game server serving the port's production build. No game files in
# the image: the extracted assets and the game's files are mounted read-only at run
# time (see docker-compose.yml), the database lives in /data.
#
#   docker build -t robotrage .

FROM node:22-slim AS web
WORKDIR /src/port/web
COPY port/web/package.json port/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY port/web/ ./
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production \
    PORT=8080 \
    APP_DIR=/app/web \
    ASSETS_DIR=/srv/assets \
    GAME_DIR=/srv/game \
    DATA_DIR=/data \
    LOG_DIR=/data/logs
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/ server/
COPY scripts/backup-db.sh scripts/moderate.mjs scripts/grant-credits.mjs scripts/
COPY --from=web /src/port/web/dist/ web/
RUN mkdir -p /data /backups && chown node:node /data /backups
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/game/main.ini').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server/index.mjs"]
