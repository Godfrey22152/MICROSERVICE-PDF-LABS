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
 && cp -r app.js routes controllers config middleware public views node_modules /prod
# Extract ONLY the node binary from the musl tarball — nothing else
RUN apk add --no-cache --virtual .build-deps curl xz \
 && curl -fsSLO --compressed \
    "https://unofficial-builds.nodejs.org/download/release/v20.20.2/node-v20.20.2-linux-x64-musl.tar.xz" \
 && mkdir -p /node-bin \
 && tar -xf node-v20.20.2-linux-x64-musl.tar.xz \
    --strip-components=2 \
    -C /node-bin \
    node-v20.20.2-linux-x64-musl/bin/node \
 && rm node-v20.20.2-linux-x64-musl.tar.xz \
 && apk del .build-deps

# ---------- Stage 2: Runtime container ----------
FROM alpine:3.21
LABEL org.opencontainers.image.title="PDF Labs App" \
      org.opencontainers.image.description="Lightweight and secure Home-page microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/home-service"
# Copy ONLY the single node binary — nothing else
COPY --from=builder /node-bin/node /usr/local/bin/node
# libstdc++ is the only runtime dependency the node binary needs on musl/Alpine
RUN apk add --no-cache libstdc++ \
 && rm -rf /var/cache/apk/* /usr/share/man /tmp/*
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app && chown -R appuser:appgroup /usr/src/app
WORKDIR /usr/src/app
USER appuser
COPY --from=builder /prod .
EXPOSE 3500
CMD ["node", "app.js"]
