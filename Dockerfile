# ---------- Stage 1: Build the app ----------
FROM node:18-alpine AS builder

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
RUN mkdir -p /prod \
 && cp -r server.js routes config middleware public views node_modules controllers models utils /prod

# ---------- Stage 2: Runtime container ----------
FROM alpine:3.18

LABEL org.opencontainers.image.title="PDF TO AUDIO APP" \
      org.opencontainers.image.description="Lightweight and secure PDF to Audio Tool microservice for PDF Labs" \
      org.opencontainers.image.authors="Godfrey" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/tree/pdf-to-audio-service"

# Install Node.js 18, Python, gTTS, Poppler, and FFmpeg
RUN apk add --no-cache nodejs=18.20.1-r0 npm python3 py3-pip poppler-utils ffmpeg \
 && pip3 install --no-cache-dir gTTS \
 && rm -rf /var/cache/apk/* /usr/share/man /usr/lib/node_modules

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
 && mkdir -p /usr/src/app && chown -R appuser:appgroup /usr/src/app

WORKDIR /usr/src/app
USER appuser

COPY --from=builder /prod .

EXPOSE 5400
CMD ["node", "server.js"]
