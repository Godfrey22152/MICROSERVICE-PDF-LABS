# PDF ↔ Excel conversion handled by ConvertAPI (free tier: 250 conversions/month)
# ---------- Stage 1: Build ----------
FROM node:20.20.2-alpine AS builder

# Set working directory
WORKDIR /usr/src/app

# Only copy dependency manifest files for faster caching
COPY package*.json ./

# npm install (not ci) to avoid lock-file sync errors when deps change
RUN npm install --omit=dev && npm cache clean --force

# Copy only necessary app source
COPY . .

# Strip dev/docs noise from node_modules to shrink the layer
RUN find node_modules \
    -type f \( -name '*.md' -o -name '*.ts' -o -name '*.map' \
    -o -name '*.tsbuildinfo' -o -name '*.spec.*' -o -name '*.test.*' \
    -o -name 'LICENSE' -o -name '*.txt' \) -delete \
 && find node_modules \
    -type d \( -name 'test' -o -name 'tests' -o -name 'docs' \
    -o -name 'example*' -o -name '__*__' -o -name '.github' \) \
    -exec rm -rf {} + 2>/dev/null || true

# Copy only production essentials into /prod
RUN mkdir -p /prod \
 && cp -r server.js routes config middleware public views \
         controllers models utils node_modules /prod

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

# ---------- Stage 2: Runtime ----------
FROM alpine:3.21

# Metadata for maintainability
LABEL org.opencontainers.image.title="SHEETLAB SERVICE" \
      org.opencontainers.image.description="PDF ↔ Excel conversion microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/sheetlab-service"


# Copy the stripped and UPX-compressed node binary from builder
COPY --from=builder /node-bin/node /usr/local/bin/node

# libstdc++ is the only runtime dependency the node binary needs on musl/Alpine
RUN apk add --no-cache libstdc++ \
 && rm -rf /var/cache/apk/* /usr/share/man /tmp/*

# Create non-root user and working directory for enhanced security
RUN addgroup -S appgroup \
 && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app \
 && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser

# Copy production artifact from builder
COPY --from=builder /prod .

# Runtime directories for uploads and outputs
RUN mkdir -p uploads outputs

# Expose only required port
EXPOSE 5600

# Run the application
CMD ["node", "server.js"]
