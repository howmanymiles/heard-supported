# The adviser app as one container. Built in GitHub Actions and pushed to the
# environment's container registry; runs on Azure Container Apps.
FROM node:26-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY app/package.json app/
COPY core/package.json core/
COPY engine/package.json engine/
COPY evals/package.json evals/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build -w app \
 && cp -r app/.next/static app/.next/standalone/app/.next/static \
 && mkdir -p app/.next/standalone/app/db \
 && cp -r app/db/migrations app/.next/standalone/app/db/migrations

FROM node:26-bookworm-slim
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
# Security updates for the base system; and no package managers in the running image,
# since nothing is installed at run time and they only add things to attack.
RUN apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /srv
COPY --from=build --chown=node:node /src/app/.next/standalone ./
USER node
EXPOSE 3000
CMD ["node", "app/server.js"]
