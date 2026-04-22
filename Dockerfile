# ---------- Stage 1: Build ----------
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency manifests first for layer caching
COPY package*.json ./

# Install production dependencies only; clean npm cache
RUN npm ci --omit=dev \
 && npm cache clean --force

# Copy application source
COPY . .

# Strip unnecessary files from node_modules to shrink the layer
RUN find node_modules \
    -type f \( -name '*.md' -o -name '*.ts' -o -name '*.map' -o -name '*.tsbuildinfo' \
    -o -name '*.spec.*' -o -name '*.test.*' -o -name 'LICENSE' -o -name '*.txt' \) -delete \
 && find node_modules \
    -type d \( -name 'test' -o -name 'tests' -o -name 'docs' -o -name 'example*' \
    -o -name '__*__' -o -name '.github' \) -exec rm -rf {} + || true

# Collect only what the runtime needs
RUN mkdir -p /prod \
 && cp -r server.js routes config middleware public views node_modules \
         controllers models utils /prod

# ---------- Stage 2: Runtime ----------
FROM alpine:3.18

LABEL org.opencontainers.image.title="PDF COMPRESSOR SERVICE" \
      org.opencontainers.image.description="Lightweight PDF compression microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-compressor-service"

# Node.js 18 LTS + Ghostscript (gs) for PDF compression
RUN apk add --no-cache nodejs=18.20.1-r0 ghostscript \
 && rm -rf /var/cache/apk/* /usr/share/man /usr/lib/node_modules

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser

COPY --from=builder /prod .

EXPOSE 5300

CMD ["node", "server.js"]
