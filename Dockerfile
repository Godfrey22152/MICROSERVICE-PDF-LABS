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

# ---------- Stage 2: Runtime container ----------

FROM alpine:3.22.4

LABEL org.opencontainers.image.title="PDF TO IMAGE APP" \
      org.opencontainers.image.description="Lightweight and secure PDF to image Tool microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-to-image-service"

COPY --from=builder /node-bin/node /usr/local/bin/node

# Key change: tiff is now pulled from @edge just like openjpeg,
# because CVE-2023-52356 and CVE-2026-4775 are not yet patched
# in the Alpine 3.22.4 stable tiff package (4.7.1-r0).
RUN echo "@edge https://dl-cdn.alpinelinux.org/alpine/edge/main" >> /etc/apk/repositories \
 && apk add --no-cache libstdc++ poppler-utils \
 && apk add --no-cache --allow-untrusted "openjpeg@edge>=2.5.4" \
 && apk add --no-cache --allow-untrusted "tiff@edge>=4.7.0-r1" \
 && apk upgrade --no-cache sqlite-libs musl musl-utils libcrypto3 libssl3 \
 && sed -i '/@edge/d' /etc/apk/repositories \
 && rm -rf /var/cache/apk/* /usr/share/man /tmp/* /usr/lib/node_modules

RUN addgroup -S appgroup \
 && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app \
 && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app

USER appuser

COPY --from=builder /prod .

EXPOSE 5100

CMD ["node", "server.js"]
