# ---------- STAGE 1: Builder ----------
FROM node:18-slim AS builder

WORKDIR /app

# Install openssl (untuk Prisma)
RUN apt-get update && apt-get install -y openssl

ARG DATABASE_URL_BUILD
ENV DATABASE_URL=${DATABASE_URL_BUILD}

# Install deps (termasuk devDeps)
COPY package*.json ./
# install semua dependency termasuk devDependencies
RUN npm install --frozen-lockfile

# Tambahkan tipe untuk file-saver agar build tidak error
RUN npm install --save-dev @types/file-saver

# Prisma: schema dan client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy seluruh source
COPY . .

# Build Next.js
RUN npm run build


# ---------- STAGE 2: Production ----------
FROM node:18-slim

WORKDIR /app

# Install dep prod saja
COPY package*.json ./
RUN npm install --frozen-lockfile --production

# Copy hasil build dari builder
COPY --from=builder /app /app

# Install openssl jika dibutuhkan untuk Prisma
RUN apt-get update && apt-get install -y openssl

# Jalankan prisma migrate deploy (jika belum) lalu start
CMD npx prisma migrate deploy || echo "Migrate skipped (DB sudah ada)" && npm run start
