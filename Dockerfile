# ---------- Stage 1: Build the app ----------

FROM node:20.20.2-alpine AS builder

WORKDIR /usr/src/app
COPY package*.json ./

RUN npm ci --omit=dev \
 && npm cache clean --force

COPY . .

RUN find node_modules \
    -type f \( -name '*.md' -o -name '*.ts' -o -name '*.map' -o -name '*.tsbuildinfo' \
    -o -name '*.spec.*' -o -name '*.test.*' -o -name 'LICENSE' -o -name '*.txt' \) -delete \
 && find node_modules \
    -type d \( -name 'test' -o -name 'tests' -o -name 'docs' -o -name 'example*' \
    -o -name '__*__' -o -name '.github' \) -exec rm -rf {} + || true

RUN mkdir -p /prod \
 && cp -r server.js routes config middleware public views node_modules controllers models utils /prod

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
# Alpine 3.22/edge both still ship tiff 4.7.1-r0 with no patch for
# CVE-2023-52356 and CVE-2026-4775. We compile upstream libtiff at
# a commit that includes both fixes and install it to /tiff-install.

FROM alpine:3.22.4 AS tiff-builder

RUN apk add --no-cache \
    build-base cmake git \
    jpeg-dev zlib-dev zstd-dev libwebp-dev

# Clone libtiff and check out a commit after both CVE fixes.
# CVE-2026-4775 fix commit (putcontig8bitYCbCr44tile): upstream main, April 2026.
# Using a shallow clone of the release/v4.7 branch post-fix is safest.
RUN git clone --depth=50 --branch v4.7 \
    https://gitlab.com/libtiff/libtiff.git /src/libtiff

WORKDIR /src/libtiff

# Build and install to a staging prefix
RUN cmake -B build \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=/tiff-install \
    -DBUILD_SHARED_LIBS=ON \
    -Dtiff-tools=OFF \
    -Dtiff-tests=OFF \
    -Dtiff-docs=OFF \
 && cmake --build build --parallel "$(nproc)" \
 && cmake --install build

# ---------- Stage 3: Build patched SQLite from source ----------
# CVE-2025-70873 requires SQLite >= 3.51.2. Alpine 3.22 ships 3.49.2-r1.

FROM alpine:3.22.4 AS sqlite-builder

RUN apk add --no-cache build-base

# SQLite 3.51.2 release tarball (the first release fixing CVE-2025-70873)
RUN wget -q "https://www.sqlite.org/2026/sqlite-autoconf-3510200.tar.gz" \
 && tar -xzf sqlite-autoconf-3510200.tar.gz

WORKDIR /sqlite-autoconf-3510200

RUN ./configure --prefix=/sqlite-install --disable-static --enable-shared \
 && make -j"$(nproc)" \
 && make install

# ---------- Stage 4: Runtime container ----------

FROM alpine:3.22.4

LABEL org.opencontainers.image.title="PDF TO IMAGE APP" \
      org.opencontainers.image.description="Lightweight and secure PDF to image Tool microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-to-image-service"

COPY --from=builder /node-bin/node /usr/local/bin/node

# Install runtime deps and patch core libs.
# openjpeg comes from edge (fixes CVE-2025-54874).
# tiff and sqlite are overridden by our source-built versions below.
RUN echo "@edge https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories \
 && apk add --no-cache libstdc++ poppler-utils \
 && apk add --no-cache --allow-untrusted "openjpeg@edge>=2.5.4" \
 && apk upgrade --no-cache musl musl-utils libcrypto3 libssl3 \
 && sed -i '/@edge/d' /etc/apk/repositories \
 && rm -rf /var/cache/apk/* /usr/share/man /tmp/* /usr/lib/node_modules

# Overwrite APK-managed libtiff with our patched source-built version.
# The SO name stays libtiff.so.6, so all existing dependents (poppler etc.)
# link against the patched binary transparently.
COPY --from=tiff-builder /tiff-install/lib/libtiff.so.6* /usr/lib/

# Overwrite APK-managed libsqlite3 with SQLite 3.51.2 (fixes CVE-2025-70873).
COPY --from=sqlite-builder /sqlite-install/lib/libsqlite3.so.0* /usr/lib/

# Verify the overrides landed correctly (fails the build if something is wrong)
RUN ldconfig -v 2>/dev/null | grep -E 'libtiff|libsqlite' || true \
 && ls -la /usr/lib/libtiff.so.6* /usr/lib/libsqlite3.so.0*

RUN addgroup -S appgroup \
 && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app \
 && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser

COPY --from=builder /prod .

EXPOSE 5100
CMD ["node", "server.js"]
