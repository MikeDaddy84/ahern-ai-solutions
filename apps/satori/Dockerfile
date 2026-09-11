FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ARG GIT_SHA
ENV GIT_SHA=${GIT_SHA}
ENV NODE_ENV=production
ENV PORT=8080
ENV TZ=America/Chicago

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/db/migrations ./dist/db/migrations
COPY --from=builder /app/src/db/schema.ts ./src/db/schema.ts

EXPOSE 8080

# Shell-form CMD handles migrations before starting Fastify server to avoid Render YAML mangling
CMD ["sh", "-c", "node dist/db/migrate.js && npm start"]

