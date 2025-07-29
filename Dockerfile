# ---------- Stage 1: Build the app ----------
FROM node:22-alpine AS builder

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
 && cp -r app.js routes config controllers middleware public views node_modules /prod

# ---------- Stage 2: Runtime container ----------
FROM alpine:3.18

# Metadata for maintainability
LABEL org.opencontainers.image.title="PDF Labs App" \
      org.opencontainers.image.description="Lightweight and secure Logout-page microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/profile-service"

# Install Node.js runtime only
RUN apk add --no-cache nodejs=18.20.1-r0 \
 && rm -rf /var/cache/apk/* /usr/share/man /usr/lib/node_modules

# Use non-root user for enhanced security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser

# Copy production-ready files
COPY --from=builder /prod .

# Expose only required port
EXPOSE 5000

# Run the application
CMD ["node", "app.js"]
