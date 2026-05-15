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

# ---------- Stage 2: Build poppler WITHOUT libtiff ----------
# tiff 4.7.1-r0 carries CVE-2023-52356 and CVE-2026-4775 with no Alpine patch.
# Alpine's poppler package links against libtiff only for TIFF image output
# (pdfimages -tiff). This PDF-to-image app outputs PNG/JPEG, so libtiff is
# completely unnecessary. Building with -DENABLE_LIBTIFF=OFF eliminates it.
FROM alpine:3.22.4 AS poppler-builder

# freetype-dev and fontconfig-dev are REQUIRED (hard cmake deps, not optional).
# The previous attempt was missing freetype-dev, causing cmake to abort.
RUN apk add --no-cache \
    build-base \
    cmake \
    curl \
    xz \
    freetype-dev \
    fontconfig-dev \
    libjpeg-turbo-dev \
    libpng-dev \
    openjpeg-dev \
    lcms2-dev \
    zlib-dev \
    cairo-dev \
    pixman-dev

RUN curl -fsSL "https://poppler.freedesktop.org/poppler-26.05.0.tar.xz" \
    -o /tmp/poppler.tar.xz \
 && mkdir -p /src/poppler \
 && tar -xf /tmp/poppler.tar.xz -C /src/poppler --strip-components=1 \
 && rm /tmp/poppler.tar.xz

WORKDIR /src/poppler

RUN cmake -B build \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=/poppler-install \
    -DBUILD_SHARED_LIBS=ON \
    -DENABLE_LIBTIFF=OFF \
    -DENABLE_QT5=OFF \
    -DENABLE_QT6=OFF \
    -DENABLE_GLIB=OFF \
    -DENABLE_GTK_DOC=OFF \
    -DENABLE_BOOST=OFF \
    -DENABLE_NSS3=OFF \
    -DENABLE_GPGME=OFF \
    -DBUILD_GTK_TESTS=OFF \
    -DBUILD_QT5_TESTS=OFF \
    -DBUILD_QT6_TESTS=OFF \
    -DBUILD_CPP_TESTS=OFF \
    -DBUILD_MANUAL_TESTS=OFF \
 && cmake --build build --parallel "$(nproc)" \
 && cmake --install build

# ---------- Stage 3: Runtime container ----------
FROM alpine:3.22.4

LABEL org.opencontainers.image.title="PDF TO IMAGE APP" \
      org.opencontainers.image.description="Lightweight and secure PDF to image Tool microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-to-image-service"

COPY --from=builder /node-bin/node /usr/local/bin/node

# Runtime deps for our tiff-free poppler build.
# Notably: tiff is NOT listed here — that is the entire point.
RUN echo "@edge https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories \
 && apk add --no-cache \
    libstdc++ \
    freetype \
    fontconfig \
    libjpeg-turbo \
    libpng \
    openjpeg \
    lcms2 \
    zlib \
    cairo \
    libgcc \
 && apk add --no-cache --allow-untrusted "openjpeg@edge>=2.5.4" \
 && apk upgrade --no-cache sqlite-libs musl musl-utils libcrypto3 libssl3 \
 && sed -i '/@edge/d' /etc/apk/repositories \
 && rm -rf /var/cache/apk/* /usr/share/man /tmp/* /usr/lib/node_modules

# Copy the tiff-free poppler binaries and libs from the build stage
COPY --from=poppler-builder /poppler-install/bin/pdf*   /usr/local/bin/
COPY --from=poppler-builder /poppler-install/lib/libpoppler*.so* /usr/local/lib/

# Register /usr/local/lib with the musl dynamic linker
RUN echo "/usr/local/lib" >> /etc/ld-musl-x86_64.path

RUN addgroup -S appgroup \
 && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app \
 && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser

COPY --from=builder /prod .

EXPOSE 5100
CMD ["node", "server.js"]
