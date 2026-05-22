# =============================================================
# Stage 1: Extract & compress the musl Node binary
# Isolated so it only re-runs when NODE_VERSION changes.
# =============================================================
FROM node:20.20.2-alpine AS node-binary
ARG NODE_VERSION=20.20.2
RUN apk add --no-cache curl xz upx binutils \
 && curl -fsSLO --compressed \
    "https://unofficial-builds.nodejs.org/download/release/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64-musl.tar.xz" \
 && mkdir -p /node-bin \
 && tar -xf "node-v${NODE_VERSION}-linux-x64-musl.tar.xz" \
    --strip-components=2 \
    -C /node-bin \
    "node-v${NODE_VERSION}-linux-x64-musl/bin/node" \
 && rm "node-v${NODE_VERSION}-linux-x64-musl.tar.xz" \
 && strip /node-bin/node \
 && upx --best --lzma /node-bin/node

# =============================================================
# Stage 2: Install production Node dependencies
# Cached independently of app source — only re-runs when
# package*.json changes.
# =============================================================
FROM node:20.20.2-alpine AS deps
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# =============================================================
# Stage 3: Assemble production app files
# Runs on every source change, but deps layer is already cached.
# =============================================================
FROM node:20.20.2-alpine AS app-builder
WORKDIR /usr/src/app
# Bring in pre-installed deps (cache-friendly)
COPY --from=deps /usr/src/app/node_modules ./node_modules
# Copy source
COPY . .
# Prune dev noise from node_modules and collect production files
RUN find node_modules \
    -type f \( -name '*.md' -o -name '*.ts' -o -name '*.map' -o -name '*.tsbuildinfo' \
    -o -name '*.spec.*' -o -name '*.test.*' -o -name 'LICENSE' -o -name '*.txt' \) -delete \
 && find node_modules \
    -type d \( -name 'test' -o -name 'tests' -o -name 'docs' -o -name 'example*' \
    -o -name '__*__' -o -name '.github' \) -exec rm -rf {} + || true \
 && mkdir -p /prod \
 && cp -r server.js routes config middleware public views node_modules controllers models utils /prod

# =============================================================
# Stage 4: Build Poppler (pdftocairo + pdfinfo only)
# Cached until POPPLER_VERSION or build flags change.
# =============================================================
FROM alpine:3.23.4 AS poppler-builder
ARG POPPLER_VERSION=25.05.0
RUN apk add --no-cache \
    build-base \
    cmake \
    ninja \
    pkgconf \
    curl \
    cairo-dev \
    freetype-dev \
    fontconfig-dev \
    jpeg-dev \
    openjpeg-dev \
    lcms2-dev \
    zlib-dev \
    expat-dev \
    libpng-dev
WORKDIR /build
# Download in its own layer so re-builds skip the fetch if version unchanged
RUN curl -fsSL "https://poppler.freedesktop.org/poppler-${POPPLER_VERSION}.tar.xz" \
    -o poppler.tar.xz \
 && tar -xf poppler.tar.xz \
 && rm poppler.tar.xz
WORKDIR /build/poppler-${POPPLER_VERSION}
RUN cmake -B build -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=/opt/poppler \
    -DENABLE_UTILS=ON \
    -DENABLE_CPP=OFF \
    -DENABLE_GLIB=OFF \
    -DENABLE_GOBJECT_INTROSPECTION=OFF \
    -DENABLE_QT5=OFF \
    -DENABLE_QT6=OFF \
    -DENABLE_LIBTIFF=OFF \
    -DENABLE_LIBJPEG=ON \
    -DENABLE_LIBOPENJPEG=openjpeg2 \
    -DENABLE_CMS=lcms2 \
    -DENABLE_NSS3=OFF \
    -DENABLE_GPGME=OFF \
    -DENABLE_BOOST=OFF \
    -DENABLE_LIBCURL=OFF \
    -DENABLE_ZLIB_UNCOMPRESS=OFF \
    -DBUILD_SHARED_LIBS=OFF \
 && cmake --build build -- -j$(nproc) \
 && cmake --install build

# =============================================================
# Stage 5: Minimal runtime image
# =============================================================
FROM alpine:3.23.4
LABEL org.opencontainers.image.title="PDF TO IMAGE APP" \
      org.opencontainers.image.description="Lightweight and secure PDF to image Tool microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-to-image-service"

# Install runtime libs and create non-root user — all in one layer
RUN apk add --no-cache \
    libstdc++ \
    cairo \
    freetype \
    fontconfig \
    jpeg \
    openjpeg \
    lcms2 \
    zlib \
    expat \
    libpng \
 && addgroup -S appgroup \
 && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app \
 && chown -R appuser:appgroup /usr/src/app

# Copy binaries as root before dropping privileges
COPY --from=node-binary /node-bin/node /usr/local/bin/node
COPY --from=poppler-builder /opt/poppler/bin/pdftocairo /opt/poppler/bin/pdfinfo /usr/local/bin/

# Drop to non-root for everything that follows
USER appuser
WORKDIR /usr/src/app
COPY --from=app-builder /prod .

EXPOSE 5100
CMD ["node", "server.js"]
