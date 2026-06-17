FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN npm i -g bun && bun install --frozen-lockfile

FROM deps AS build
ARG NUXT_PUBLIC_GIPHY_API_KEY=""
ARG NUXT_PUBLIC_GIPHY_API_URL="https://api.giphy.com/v1/gifs"
ENV NUXT_PUBLIC_GIPHY_API_KEY=$NUXT_PUBLIC_GIPHY_API_KEY
ENV NUXT_PUBLIC_GIPHY_API_URL=$NUXT_PUBLIC_GIPHY_API_URL
COPY . .
RUN bun run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
