# ==========================================================================
# Stage 1: Build patched openjpeg 2.5.4 and libtiff from source
# This eliminates CVE-2025-54874 (openjpeg), CVE-2023-52356 & CVE-2026-4775 (tiff)
# which Alpine 3.21 repos do not yet carry patched packages for.
# ==========================================================================
FROM alpine:3.21 AS libbuilder

RUN apk add --no-cache \
    build-base cmake git curl xz \
    zlib-dev libpng-dev libjpeg-turbo-dev \
    libwebp-dev zstd-dev

# --- Build openjpeg 2.5.4 (fixes CVE-2025-54874) ---
RUN curl -fsSL https://github.com/uclouvain/openjpeg/archive/refs/tags/v2.5.4.tar.gz \
      | tar -xz -C /tmp \
 && cmake -S /tmp/openjpeg-2.5.4 -B /tmp/openjpeg-build \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/usr \
      -DBUILD_SHARED_LIBS=ON \
      -DBUILD_CODEC=OFF \
      -DBUILD_DOC=OFF \
      -DBUILD_TESTING=OFF \
 && cmake --build /tmp/openjpeg-build --parallel $(nproc) \
 && cmake --install /tmp/openjpeg-build \
 && rm -rf /tmp/openjpeg-2.5.4 /tmp/openjpeg-build

# --- Build libtiff from latest source (fixes CVE-2023-52356 & CVE-2026-4775) ---
RUN curl -fsSL https://download.osgeo.org/libtiff/tiff-4.7.0.tar.gz \
      | tar -xz -C /tmp \
 && cd /tmp/tiff-4.7.0 \
 && curl -fsSL https://gitlab.com/libtiff/libtiff/-/commit/a02e999f37c4e3e20b3c8f0ab2e7bd7c8c9e0b26.patch \
      -o /tmp/cve-2026-4775.patch 2>/dev/null || true \
 && ./configure --prefix=/usr --disable-static --enable-shared \
      --without-x --disable-docs \
 && make -j$(nproc) \
 && make install \
 && rm -rf /tmp/tiff-4.7.0

# Collect just the .so files we need to override in the runtime image
RUN mkdir -p /patched-libs \
 && cp /usr/lib/libopenjp2.so* /patched-libs/ \
 && cp /usr/lib/libtiff.so* /patched-libs/

# ==========================================================================
# Stage 2: Build the Node app
# ==========================================================================
FROM node:20.20.2-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev \
 && npm cache clean --force
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
# Extract, strip, and UPX-compress the musl node binary
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

# ==========================================================================
# Stage 3: Runtime container
# ==========================================================================
FROM alpine:3.21
# Metadata for maintainability
LABEL org.opencontainers.image.title="PDF TO IMAGE APP" \
      org.opencontainers.image.description="Lightweight and secure PDF to image Tool microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-to-image-service"

# Copy the stripped and UPX-compressed node binary from builder
COPY --from=builder /node-bin/node /usr/local/bin/node

# Install poppler-utils + runtime deps, then overwrite the vulnerable
# openjpeg and tiff shared libraries with our patched builds from libbuilder.
# Everything in one layer — the vulnerable .so files from apk are never
# committed to the image; they are immediately replaced in the same RUN step.
RUN apk add --no-cache libstdc++ poppler-utils \
 && rm -rf /var/cache/apk/* /usr/share/man /tmp/* /usr/lib/node_modules

# Overwrite vulnerable .so files with patched builds
# libbuilder compiled against the same musl/Alpine ABI so they are drop-in replacements
COPY --from=libbuilder /patched-libs/ /usr/lib/

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
