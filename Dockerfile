# ---------- Stage 1: Build ----------
FROM node:20.20.2-alpine AS builder

# Set working directory
WORKDIR /usr/src/app

# Copy dependency manifests first for layer caching
COPY package*.json ./

# npm install (not ci) to avoid lock-file sync errors when deps change
RUN npm install --omit=dev && npm cache clean --force

# Copy application source
COPY . .

# Strip unnecessary files from node_modules to shrink the layer
RUN find node_modules \
    -type f \( -name '*.md' -o -name '*.ts' -o -name '*.map' -o -name '*.tsbuildinfo' \
    -o -name '*.spec.*' -o -name '*.test.*' -o -name 'LICENSE' -o -name '*.txt' \) -delete \
 && find node_modules \
    -type d \( -name 'test' -o -name 'tests' -o -name 'docs' -o -name 'example*' \
    -o -name '__*__' -o -name '.github' \) -exec rm -rf {} + || true

# Collect only what the runtime needs
RUN mkdir -p /prod \
 && cp -r server.js routes config middleware public views node_modules \
         controllers models utils /prod

# Extract ONLY the node binary from the musl tarball
# strip it and remove debug symbols, then UPX-compress the binary
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

# ---------- Stage 2: Runtime ----------
FROM alpine:3.21

# Metadata for maintainability
LABEL org.opencontainers.image.title="PDF COMPRESSOR SERVICE" \
      org.opencontainers.image.description="Lightweight PDF compression microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-compressor-service"

# Copy the stripped and UPX-compressed node binary from builder
COPY --from=builder /node-bin/node /usr/local/bin/node

# Ghostscript (gs) for PDF compression + libstdc++
RUN apk add --no-cache libstdc++ ghostscript \
 && rm -rf /var/cache/apk/* /usr/share/man /tmp/* /usr/lib/node_modules

# Create non-root user and working directory for enhanced security
RUN addgroup -S appgroup \
 && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app \
 && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser

# Copy production artifact from builder
COPY --from=builder /prod .

# Expose only required port
EXPOSE 5300

# Run the application
CMD ["node", "server.js"]
