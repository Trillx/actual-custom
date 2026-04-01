FROM node:22-bookworm AS base

RUN apt-get update && apt-get install -y openssl python3 build-essential && apt-get clean
RUN corepack enable
WORKDIR /app

COPY .yarn ./.yarn
COPY yarn.lock package.json .yarnrc.yml ./
COPY packages/api/package.json packages/api/package.json
COPY packages/component-library/package.json packages/component-library/package.json
COPY packages/crdt/package.json packages/crdt/package.json
COPY packages/desktop-client/package.json packages/desktop-client/package.json
COPY packages/desktop-electron/package.json packages/desktop-electron/package.json
COPY packages/eslint-plugin-actual/package.json packages/eslint-plugin-actual/package.json
COPY packages/loot-core/package.json packages/loot-core/package.json
COPY packages/sync-server/package.json packages/sync-server/package.json
COPY packages/plugins-service/package.json packages/plugins-service/package.json

RUN yarn install --inline-builds

FROM base AS builder

COPY . .

RUN yarn workspace plugins-service build-dev

RUN IS_GENERIC_BROWSER=1 yarn workspace @actual-app/core build:browser

RUN WORKER_FILE=$(ls packages/loot-core/lib-dist/browser/kcab.worker.*.js | grep -v '.map$' | head -1) && \
    WORKER_HASH=$(echo "$WORKER_FILE" | sed 's/.*kcab\.worker\.\(.*\)\.js/\1/') && \
    cd packages/desktop-client && \
    IS_GENERIC_BROWSER=1 REACT_APP_BACKEND_WORKER_HASH="$WORKER_HASH" \
    ../../node_modules/.bin/vite build

RUN yarn workspace @actual-app/sync-server build

FROM base AS prod-deps

RUN yarn workspaces focus @actual-app/sync-server --production

FROM node:22-bookworm-slim AS prod

RUN apt-get update && apt-get install -y tini && apt-get clean -y && rm -rf /var/lib/apt/lists/*

ARG USERNAME=actual
ARG USER_UID=1001
ARG USER_GID=$USER_UID
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && mkdir /data && chown -R ${USERNAME}:${USERNAME} /data

WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules /app/node_modules

RUN rm -rf /app/node_modules/@actual-app/web /app/node_modules/@actual-app/sync-server

COPY --from=builder /app/packages/desktop-client/package.json /app/node_modules/@actual-app/web/package.json
COPY --from=builder /app/packages/desktop-client/build /app/node_modules/@actual-app/web/build

COPY --from=builder /app/packages/sync-server/package.json ./
COPY --from=builder /app/packages/sync-server/build ./

VOLUME /data
USER ${USERNAME}
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
EXPOSE 5006
CMD ["node", "app.js"]
