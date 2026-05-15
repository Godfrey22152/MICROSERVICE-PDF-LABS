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
FROM alpine:3.22.4

LABEL org.opencontainers.image.title="PDF TO IMAGE APP" \
      org.opencontainers.image.description="Lightweight and secure PDF to image Tool microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-to-image-service"

COPY --from=builder /node-bin/node /usr/local/bin/node

RUN apk add --no-cache --virtual .build-deps \
      build-base cmake ninja curl tar xz pkgconf \
      fontconfig-dev freetype-dev libjpeg-turbo-dev libpng-dev \
      openjpeg-dev zlib-dev lcms2-dev cairo-dev glib-dev libxml2-dev && \
    apk add --no-cache libstdc++ && \
    # Build latest Poppler WITHOUT TIFF support
    mkdir -p /tmp/poppler && cd /tmp/poppler && \
    curl -fsSLO https://poppler.freedesktop.org/poppler-26.05.0.tar.xz && \
    tar -xJf poppler-26.05.0.tar.xz --strip-components=1 && \
    mkdir build && cd build && \
    cmake -GNinja .. \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/usr \
      -DENABLE_LIBTIFF=OFF \
      -DENABLE_GLIB=ON \
      -DENABLE_UTILS=ON \
      -DENABLE_CPP=ON \
      -DENABLE_LIBOPENJPEG=openjpeg \
      -DENABLE_BOOST=OFF \
      -DBUILD_SHARED_LIBS=ON \
      -DENABLE_UNSTABLE_API_ABI_HEADERS=ON && \
    ninja && \
    ninja install && \
    # Patched packages from edge
    echo "https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories && \
    apk add --no-cache openjpeg@edge sqlite-libs@edge && \
    # Cleanup
    apk del .build-deps && \
    sed -i '/edge/d' /etc/apk/repositories && \
    rm -rf /tmp/poppler /var/cache/apk/* /usr/share/man /tmp/* /root/.cache

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    mkdir -p /usr/src/app && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser

COPY --from=builder /prod .

EXPOSE 5100
CMD ["node", "server.js"]
