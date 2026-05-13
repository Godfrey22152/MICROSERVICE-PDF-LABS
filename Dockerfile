# Stage 1: Build the app
FROM node:20.20.2-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY . .

# Prune unnecessary files from node_modules more safely
RUN find node_modules -type f \( -name "*.md" -o -name "*.markdown" -o -name "*.ts" -o -name "*.map" -o -name "*.d.ts" \) -delete \
    && find node_modules -type d -empty -delete

RUN mkdir -p /prod \
    && cp -r server.js routes config middleware public views node_modules controllers models utils /prod 2>/dev/null || true

# Extract node binary
RUN apk add --no-cache --virtual .build-deps curl xz upx binutils \
    && curl -fsSLO --compressed \
    "https://unofficial-builds.nodejs.org/download/release/v20.20.2/node-v20.20.2-linux-x64-musl.tar.xz" \
    && mkdir -p /node-bin \
    && tar -xf node-v20.20.2-linux-x64-musl.tar.xz \
    --strip-components=2 \
    -C /node-bin \
    node-v20.20.2-linux-x64-musl/bin/node \
    && rm node-v20.20.2-linux-x64-musl.tar.xz \
    && strip /node-bin/node \
    && upx --best --lzma /node-bin/node \
    && apk del .build-deps

# Stage 2: Runtime container - Use specific version with security patches
FROM alpine:3.21.7

LABEL org.opencontainers.image.title="PDF TO IMAGE APP" \
      org.opencontainers.image.description="Lightweight and secure PDF to image Tool microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey godfreyifeanyi50@gmail.com" \
      org.opencontainers.image.version="1.0.1" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-to-image-service"

# Copy node binary
COPY --from=builder /node-bin/node /usr/local/bin/node

# Update package index and upgrade all packages to latest patched versions
# Alpine 3.21 includes tiff with security fixes for CVE-2023-52356 and CVE-2026-4775
RUN apk update && apk upgrade --no-cache \
    && apk add --no-cache libstdc++ poppler-utils \
    && rm -rf /var/cache/apk/* /usr/share/man /tmp/*

# Create non-root user
RUN addgroup -S appgroup \
    && adduser -S appuser -G appgroup \
    && mkdir -p /usr/src/app \
    && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser

# Copy production files
COPY --from=builder /prod .

EXPOSE 5100

CMD ["node", "server.js"]
