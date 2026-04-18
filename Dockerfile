# ---------- Stage 1: Build ----------
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
# npm install instead of npm ci — regenerates lock file automatically,
# so adding new packages to package.json never breaks the build.
RUN npm install --omit=dev && npm cache clean --force
COPY . .
RUN mkdir -p /prod \
 && cp -r server.js routes config middleware public views node_modules controllers models utils /prod

# ---------- Stage 2: Runtime ----------
FROM node:18-alpine
LABEL org.opencontainers.image.title="PDF TO AUDIO APP" \
      org.opencontainers.image.description="Lightweight and secure PDF to Audio Tool microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey" \
      org.opencontainers.image.version="1.2.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-to-audio-service"

RUN apk add --no-cache \
      poppler-utils \
 && rm -rf /var/cache/apk/* /usr/share/man

ENV NODE_ENV=production

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser
COPY --from=builder /prod .
EXPOSE 5400
CMD ["node", "server.js"]
