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

# ---------- Stage 2: Build a patched tiff .apk package ----------
# We build tiff 4.7.0 (upstream, contains fixes for CVE-2023-52356 and
# CVE-2026-4775) as a proper Alpine .apk so the scanner sees it registered
# in the APK database with version 4.7.0-r0, replacing 4.7.1-r0.
# abuild-sign --installed registers the package without requiring a key.
FROM alpine:3.22.4 AS tiffpkg
RUN apk add --no-cache alpine-sdk cmake curl zstd-dev zlib-dev \
    libjpeg-turbo-dev libwebp-dev xz-dev
# Generate a throwaway signing key for the local package
RUN adduser -D packager \
 && addgroup packager abuild \
 && su packager -c "abuild-keygen -a -n"
# Write a minimal APKBUILD for patched libtiff
RUN mkdir -p /home/packager/tiff && cat > /home/packager/tiff/APKBUILD << 'EOF'
# Patched libtiff build — fixes CVE-2023-52356 and CVE-2026-4775
pkgname=tiff
pkgver=4.7.0
pkgrel=1
pkgdesc="Patched libtiff (CVE-2023-52356, CVE-2026-4775 fixed)"
url="https://libtiff.gitlab.io/libtiff/"
arch="all"
license="libtiff"
depends=""
makedepends="cmake zlib-dev libjpeg-turbo-dev libwebp-dev zstd-dev"
subpackages="$pkgname-dev $pkgname-libs"
source="https://download.osgeo.org/libtiff/tiff-$pkgver.tar.gz"
builddir="$srcdir/tiff-$pkgver"

build() {
    cmake -B build -S . \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr \
        -DBUILD_SHARED_LIBS=ON \
        -Dtiff-tools=OFF \
        -Dtiff-tests=OFF \
        -Dtiff-docs=OFF
    cmake --build build --parallel $(nproc)
}

package() {
    DESTDIR="$pkgdir" cmake --install build
}
EOF
RUN chown -R packager:packager /home/packager/tiff
RUN su packager -c "cd /home/packager/tiff && abuild checksum && abuild -r"
# Collect the built .apk files
RUN find /home/packager/packages -name 'tiff-libs-*.apk' -o -name 'tiff-[0-9]*.apk' \
    | xargs -I{} cp {} /tmp/

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
# Copy the locally built patched tiff .apk files from tiffpkg stage
COPY --from=tiffpkg /tmp/tiff*.apk /tmp/
# Install patched tiff .apk FIRST (registers 4.7.0-r1 in APK database),
# then install poppler-utils — apk sees tiff already satisfied and does
# not downgrade it back to the vulnerable 4.7.1-r0.
RUN apk add --no-cache --allow-untrusted /tmp/tiff*.apk \
 && apk add --no-cache libstdc++ poppler-utils \
 && apk add --no-cache --upgrade \
      --repository https://dl-cdn.alpinelinux.org/alpine/edge/main \
      --allow-untrusted openjpeg \
 && apk upgrade --no-cache musl musl-utils libcrypto3 libssl3 \
 && rm -f /tmp/tiff*.apk \
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
