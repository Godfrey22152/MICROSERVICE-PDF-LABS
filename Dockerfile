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
 && cp -r app.js routes controllers config middleware public views node_modules /prod

# Download Node.js 20.20.2 musl binary — correct URL and extension
RUN apk add --no-cache --virtual .build-deps curl \
 && mkdir -p /node-bin \
 && curl -fsSLO --compressed \
    "https://unofficial-builds.nodejs.org/download/release/v20.20.2/node-v20.20.2-linux-x64-musl.tar.xz" \
 && tar -xf node-v20.20.2-linux-x64-musl.tar.xz -C /node-bin --strip-components=1 \
 && rm node-v20.20.2-linux-x64-musl.tar.xz \
 && rm -rf /node-bin/include \
            /node-bin/share \
            /node-bin/lib/node_modules/npm \
            /node-bin/lib/node_modules/corepack \
            /node-bin/bin/npm \
            /node-bin/bin/npx \
            /node-bin/bin/corepack \
 && apk del .build-deps

# ---------- Stage 2: Runtime container ----------
FROM alpine:3.21

# Metadata for maintainability
LABEL org.opencontainers.image.title="PDF Labs App" \
      org.opencontainers.image.description="Lightweight and secure Home-page microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/home-service"

# Copy only the node binary from builder
COPY --from=builder /node-bin/bin/node /usr/local/bin/node

# libstdc++ is required by the Node.js binary on musl/Alpine
RUN apk add --no-cache libstdc++ \
 && rm -rf /var/cache/apk/* /usr/share/man /tmp/*

# Use non-root user for enhanced security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser

# Copy production-ready files
COPY --from=builder /prod .

# Expose only required port
EXPOSE 3500

# Run the application
CMD ["node", "app.js"]
