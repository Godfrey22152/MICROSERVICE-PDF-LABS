# ---------- Stage 1: Build dependencies ----------
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install dependencies and prune them
RUN npm ci --omit=dev \
 && find node_modules \
    -type f \( -name '*.md' -o -name '*.ts' -o -name '*.map' -o -name '*.tsbuildinfo' \
    -o -name '*.spec.*' -o -name '*.test.*' -o -name 'LICENSE' -o -name '*.txt' \) -delete \
 && find node_modules \
    -type d \( -name 'test' -o -name 'tests' -o -name 'docs' -o -name 'example*' \
    -o -name '__*__' -o -name '.github' \) -exec rm -rf {} + || true

# Copy app source
COPY . .

# Create a production-ready directory with only necessary files
RUN mkdir -p /prod \
 && cp -r node_modules /prod/ \
 && cp -r config /prod/ \
 && cp -r controllers /prod/ \
 && cp -r middleware /prod/ \
 && cp -r models /prod/ \
 && cp -r public /prod/ \
 && cp -r routes /prod/ \
 && cp -r utils /prod/ \
 && cp -r views /prod/ \
 && cp server.js /prod/ \
 && cp package.json /prod/


# ---------- Stage 2: Runtime image ----------
FROM alpine:3.18

# Install only nodejs runtime and clean up cache
RUN apk add --no-cache nodejs=18.20.1-r0 \
 && rm -rf /var/cache/apk/*


# Use non-root user for enhanced security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser

# Copy production-ready files from builder
COPY --from=builder /prod . 

LABEL org.opencontainers.image.title="Image to PDF APP" \
      org.opencontainers.image.description="Lightweight and secure Image to PDF Tool microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/image-to-pdf-service"

EXPOSE 5200

CMD ["node", "server.js"]
