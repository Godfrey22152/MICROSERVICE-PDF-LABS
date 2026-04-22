# PDF editing handled by ConvertAPI 

# ---------- Stage 1: Build ----------
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# npm install (not ci) to avoid lock-file sync errors when deps change
RUN npm install --omit=dev && npm cache clean --force

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

RUN mkdir -p /prod \
 && cp -r server.js routes config middleware public views \
         controllers models utils node_modules /prod

# ---------- Stage 2: Runtime ----------
FROM alpine:3.21

LABEL org.opencontainers.image.title="EDIT PDF SERVICE" \
      org.opencontainers.image.description="PDF editing microservice for PDF Labs (rotate, watermark, merge, split, protect, unlock)" \
      org.opencontainers.image.authors="Godfrey <godfreyifeanyi50@gmail.com>" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/edit-pdf-service"

RUN apk add --no-cache nodejs \
 && rm -rf /var/cache/apk/* /usr/share/man /usr/lib/node_modules

RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser

COPY --from=builder /prod .

EXPOSE 5800

CMD ["node", "server.js"]
