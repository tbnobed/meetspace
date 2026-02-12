FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && \
    npm install drizzle-kit tsx && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY shared ./shared
COPY deploy/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
