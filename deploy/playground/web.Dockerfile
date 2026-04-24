FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @chemd/web build

FROM node:22-bookworm-slim AS runner

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV NODE_ENV=production

WORKDIR /app

RUN corepack enable

COPY --from=builder /app /app

EXPOSE 2436

CMD ["pnpm", "--filter", "@chemd/web", "exec", "next", "start", "-H", "0.0.0.0", "-p", "2436"]
