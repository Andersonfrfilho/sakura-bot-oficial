FROM oven/bun:1.1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --production

FROM base AS builder
COPY package.json bun.lockb* ./
RUN bun install
COPY . .
RUN bun build ./src/index.ts --outdir ./dist --target bun --minify

FROM oven/bun:1.1 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 3333
CMD ["bun", "run", "dist/index.js"]
