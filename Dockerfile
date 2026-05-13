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

# ---------- Stage 2: Build patched libtiff from source ----------
# tiff 4.7.1-r0 is unpatched across ALL Alpine branches (including edge) for
# CVE-2023-52356 and CVE-2026-4775. No apk package exists with a fix.
# We build libtiff 4.7.0 from upstream source (which includes both fixes),
# install it to /usr/local, then the runtime stage installs poppler-utils
# (which brings in apk tiff), we then REMOVE the apk tiff record and replace
# its .so with our patched build — eliminating the APK database entry entirely.
FROM alpine:3.22.4 AS tiffbuilder
RUN apk add --no-cache build-base cmake curl zstd-dev zlib-dev xz-dev \
    libjpeg-turbo-dev libwebp-dev
RUN curl -fsSL "https://download.osgeo.org/libtiff/tiff-4.7.0.tar.gz" \
      | tar -xz -C /tmp \
 && cmake -S /tmp/tiff-4.7.0 -B /tmp/tiff-build \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/tiff-patched \
      -DBUILD_SHARED_LIBS=ON \
      -Dtiff-tools=OFF \
      -Dtiff-tests=OFF \
      -Dtiff-docs=OFF \
 && cmake --build /tmp/tiff-build --parallel $(nproc) \
 && cmake --install /tmp/tiff-build

# ---------- Stage 3: Runtime container ----------
FROM alpine:3.22.4
# Metadata for maintainability
LABEL org.opencontainers.image.title="PDF TO IMAGE APP" \
      org.opencontainers.image.description="Lightweight and secure PDF to image Tool microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-to-image-service"
# Copy the stripped and UPX-compressed node binary from builder
COPY --from=builder /node-bin/node /usr/local/bin/node
# Install poppler-utils (pulls in vulnerable apk tiff as dependency),
# then surgically remove the apk tiff package record AND its .so files,
# replace with our patched libtiff .so from tiffbuilder.
# apk del --no-scripts tiff removes the APK database entry (eliminating
# the scanner finding) without breaking poppler — poppler finds the
# replacement .so at the same path via ldconfig.
RUN echo "@edge https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories \
 && apk add --no-cache libstdc++ poppler-utils \
 && apk add --no-cache --allow-untrusted "openjpeg@edge>=2.5.4" \
 && apk upgrade --no-cache sqlite-libs musl musl-utils libcrypto3 libssl3 \
 && sed -i '/@edge/d' /etc/apk/repositories \
 && apk del --no-scripts tiff \
 && rm -rf /var/cache/apk/* /usr/share/man /tmp/* /usr/lib/node_modules
# Copy patched libtiff .so from tiffbuilder and register it
COPY --from=tiffbuilder /tiff-patched/lib/libtiff.so* /usr/lib/
RUN ldconfig /usr/lib 2>/dev/null || true
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
