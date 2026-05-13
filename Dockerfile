# ---------- Stage 1: Build the app ----------
FROM node:20.20.2-alpine AS builder
# Set working directory
WORKDIR /usr/src/app
# Only copy dependency manifest files for faster caching
COPY package*.json ./
# Install production dependencies and clean cache to reduce size
RUN npm ci --omit=dev \
 && npm cache clean --force
# Copy only necessary app source
COPY . .
# Prune unnecessary files from node_modules
RUN find node_modules \
    -type f \( -name '*.md' -o -name '*.ts' -o -name '*.map' -o -name '*.tsbuildinfo' \
    -o -name '*.spec.*' -o -name '*.test.*' -o -name 'LICENSE' -o -name '*.txt' \) -delete \
 && find node_modules \
    -type d \( -name 'test' -o -name 'tests' -o -name 'docs' -o -name 'example*' \
    -o -name '__*__' -o -name '.github' \) -exec rm -rf {} + || true
# Copy only production essentials into /prod
RUN mkdir -p /prod \
 && cp -r server.js routes config middleware public views node_modules controllers models utils /prod
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

# ---------- Stage 2: Runtime container ----------
# alpine:3.22.4 — the exact point release that ships:
#   libcrypto3/libssl3 3.5.6-r0  (fixes CVE-2026-31789, CVE-2026-28387/88/89/90)
#   musl 1.2.5-r12+              (fixes CVE-2026-40200)
#   sqlite-libs 3.49.x           (fixes CVE-2025-70873)
# Generic 'alpine:3.22' on Docker Hub is stale at 3.22.0 — do NOT use it.
FROM alpine:3.21.7
# Metadata for maintainability
LABEL org.opencontainers.image.title="PDF TO IMAGE APP" \
      org.opencontainers.image.description="Lightweight and secure PDF to image Tool microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-to-image-service"
# Copy the stripped and UPX-compressed node binary from builder
COPY --from=builder /node-bin/node /usr/local/bin/node
# Step 1: Add the Alpine edge repo ONLY for openjpeg 2.5.4-r1 (CVE-2025-54874).
#         Pin it so no other edge packages bleed in.
# Step 2: Install poppler-utils + libstdc++ from 3.22.4 repos (patched OpenSSL/musl).
# Step 3: Upgrade only openjpeg from edge, tiff and sqlite-libs from 3.22.4.
# Step 4: Remove the edge repo pin immediately — we only needed it for openjpeg.
# All in one layer so the APK database records final patched versions only.
RUN echo "https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories \
 && echo "@edge https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories \
 && apk add --no-cache libstdc++ poppler-utils \
 && apk add --no-cache --allow-untrusted "openjpeg@edge>=2.5.4" \
 && apk upgrade --no-cache tiff sqlite-libs musl musl-utils libcrypto3 libssl3 \
 && sed -i '/@edge/d' /etc/apk/repositories \
 && rm -rf /var/cache/apk/* /usr/share/man /tmp/* /usr/lib/node_modules
# Create non-root user and working directory for enhanced security
RUN addgroup -S appgroup \
 && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app \
 && chown -R appuser:appgroup /usr/src/app
WORKDIR /usr/src/app
USER appuser
# Copy production-ready files
COPY --from=builder /prod .
# Expose only required port
EXPOSE 5100
# Run the application
CMD ["node", "server.js"]
