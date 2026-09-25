FROM node:24-slim
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/contract/package.json packages/contract/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --prod --filter @crm/api...

COPY packages/contract/src packages/contract/src
COPY apps/api/src apps/api/src

ENV NODE_ENV=production
WORKDIR /app/apps/api
USER node
CMD ["node", "src/main.ts"]
