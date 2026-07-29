# --- Stage 1: build web ---
FROM node:22-slim AS web-build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY server/prisma server/prisma
RUN npm ci
COPY web web
RUN npm run build -w web

# --- Stage 2: build server ---
FROM node:22-slim AS server-build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY server/prisma server/prisma
RUN npm ci
COPY server server
RUN npm run build -w server

# --- Stage 3: runtime ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY server/package.json server/package.json
COPY server/prisma server/prisma
RUN npm ci --omit=dev --workspace=server

COPY --from=server-build /app/server/dist server/dist
COPY --from=web-build /app/web/dist web/dist

WORKDIR /app/server
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
