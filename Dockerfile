# Stage 1: Build the app
FROM node:20.20.2-alpine AS builder

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .

RUN mkdir -p /prod && cp -r server.js routes config middleware public views node_modules controllers models utils /prod 2>/dev/null || true

# Stage 2: Runtime - Use Chainguard's minimal image (no vulnerabilities)
FROM cgr.dev/chainguard/node:20-dev AS runtime

USER root
RUN apk add --no-cache poppler-utils tiff-tools
USER nonroot

WORKDIR /usr/src/app
COPY --from=builder /prod .
COPY --from=builder /usr/src/app/node_modules ./node_modules

EXPOSE 5100
CMD ["node", "server.js"]
