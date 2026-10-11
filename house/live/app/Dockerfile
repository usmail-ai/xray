# live-mesh: Node server + the read-only GitHub collector (python3 stdlib only; tzdata for zoneinfo)
FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 tzdata ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
COPY collector ./collector
ENV NODE_ENV=production TZ=America/Chicago
CMD ["node", "server.mjs"]
