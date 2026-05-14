FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN npm i -g bun && bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
