# TokenBrake Server — self-hosted team API-cost gateway. Node 24+ for built-in node:sqlite.
FROM node:24-slim
WORKDIR /app
COPY package.json ./
COPY lib ./lib
COPY server ./server
# spend DB lives on a mounted volume so it survives restarts
ENV TB_PORT=8788
ENV TB_DB=/data/tokenbrake.db
VOLUME /data
EXPOSE 8788
CMD ["node", "server/app.mjs"]
