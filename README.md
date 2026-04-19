# PDF Labs — Microservice PDF Project

> A full-stack, multi-service PDF processing platform built with Node.js and Docker. PDF Labs is composed of **13 independent microservices**, each living in its own Git branch and Docker container, orchestrated together via Docker Compose and deployable to Kubernetes. Users can convert, compress, edit, and transform PDF documents through a unified, JWT-authenticated web interface.

---

## Table of Contents

- [Overview](#overview)
- [Repository Structure](#repository-structure)
- [Service Map](#service-map)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Environment Variables](#environment-variables)
- [Running the Full Stack](#running-the-full-stack)
  - [Prerequisites](#prerequisites)
  - [Quick Start with Docker Compose](#quick-start-with-docker-compose)
- [Authentication Model](#authentication-model)
- [Git Branch Structure](#git-branch-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

PDF Labs is a microservices application where every feature — from user authentication to PDF compression — is an isolated Node.js/Express service with its own MongoDB namespace, Dockerfile, and independent deployment lifecycle. Services communicate exclusively through JWT-authenticated HTTP redirects and shared browser `localStorage` token storage; there is no API gateway or inter-service HTTP mesh.

**Key design principles:**

- Every service is independently buildable, deployable, and replaceable
- A single shared `JWT_SECRET` allows all services to verify tokens issued by the account-service without any additional key infrastructure
- No service calls another service's API — the browser holds the token and presents it on each navigation
- Services that need PDF processing use either local system tools (Ghostscript, Poppler) or the ConvertAPI v2 REST API over raw HTTPS

---

## Repository Structure

This repository (the **main branch**) is the orchestration root. It does not contain any service source code. Each microservice lives in its own dedicated Git branch.

```
main branch (this repository)
├── docker-compose.yml          # Wires all 13 services + MongoDB together
├── README.md                   # This file
└── k8s/                        # Kubernetes deployment manifests (will be added soon)
    ├── namespace.yaml
    ├── mongo/
    └── services/
        ├── account-service/
        ├── home-service/
        └── ...

Individual service branches (each checked out separately):
  account-service     →  branch: account-service
  home-service        →  branch: home-service
  profile-service     →  branch: profile-service
  logout-service      →  branch: logout-service
  tools-service       →  branch: tools-service
  pdf-to-image-service  →  branch: pdf-to-image-service
  image-to-pdf-service  →  branch: image-to-pdf-service
  pdf-compressor-service →  branch: pdf-compressor-service
  pdf-to-audio-service  →  branch: pdf-to-audio-service
  pdf-to-word-service   →  branch: pdf-to-word-service
  sheetlab-service      →  branch: sheetlab-service
  word-to-pdf-service   →  branch: word-to-pdf-service
  edit-pdf-service      →  branch: edit-pdf-service
```

The **[docker-compose.yml](./docker-compose.yml)** in this branch builds each service directly from its cloned source directory on the host (`build: ~/pdf/<service-name>`), so each service branch must be checked out locally before running the full stack.

---

## Service Map

| Service | Branch | Port | Role | Processing |
|---|---|---|---|---|
| `account-service` | `account-service` | 3000 | Landing page & authentication | — |
| `home-service` | `home-service` | 3500 | Post-login dashboard | — |
| `profile-service` | `profile-service` | 4000 | User profile & account management | — |
| `logout-service` | `logout-service` | 4500 | Session termination | — |
| `tools-service` | `tools-service` | 5000 | Authenticated tools hub | — |
| `pdf-to-image-service` | `pdf-to-image-service` | 5100 | PDF → PNG/JPEG/TIFF/SVG/EPS/PS | Poppler (`pdftocairo`) |
| `image-to-pdf-service` | `image-to-pdf-service` | 5200 | JPG/PNG → PDF | `pdf-lib` (in-process) |
| `pdf-compressor-service` | `pdf-compressor-service` | 5300 | PDF compression (4 quality levels) | Ghostscript |
| `pdf-to-audio-service` | `pdf-to-audio-service` | 5400 | PDF → MP3 (30+ neural voices) | Poppler + Edge TTS |
| `pdf-to-word-service` | `pdf-to-word-service` | 5500 | PDF → DOCX (standard + OCR) | ConvertAPI v2 |
| `sheetlab-service` | `sheetlab-service` | 5600 | PDF ↔ Excel (.xlsx/.xls) | ConvertAPI v2 |
| `word-to-pdf-service` | `word-to-pdf-service` | 5700 | DOCX/DOC/ODT/RTF/PPTX/PPT → PDF | ConvertAPI v2 |
| `edit-pdf-service` | `edit-pdf-service` | 5800 | Rotate, watermark, merge, split, protect, unlock | ConvertAPI v2 |

---

## Architecture

```
                    ┌──────────────────────────────────────────┐
                    │              Browser (User)              │
                    │  localStorage: JWT token                 │
                    │  Appended as ?token=<jwt> on navigation  │
                    └──────────────┬───────────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────────┐
                    │        account-service (:3000)           │
                    │  • Landing page & registration           │
                    │  • Login → issues JWT (1 hour)           │
                    └──────────────┬───────────────────────────┘
                                   │ redirect with ?token=
                    ┌──────────────▼───────────────────────────┐
                    │         home-service (:3500)             │
                    │  • Authenticated dashboard               │
                    │  • Navigation hub                        │
                    └──┬──────────┬──────────┬─────────────────┘
                       │          │          │
           ┌───────────▼─┐  ┌─────▼─────┐ ┌──▼─────────┐
           │tools-service│  │  profile  │ │   logout   │
           │  (:5000)    │  │  (:4000)  │ │  (:4500)   │
           └──┬──┬──┬──┬─┘  └───────────┘ └────────────┘
              │  │  │  │
    ┌─────────┘  │  │  └─────────────────────────────────────────┐
    │  ┌─────────┘  └──────────┐                                 │
    ▼  ▼                       ▼                                 ▼
 :5100 :5200              :5300 :5400 :5500               :5600 :5700 :5800
pdf→img img→pdf       compress audio  word             sheetlab w→pdf edit-pdf

                    ┌──────────────────────────────────────────┐
                    │           MongoDB (:27017)               │
                    │  Each service has its own DB namespace   │
                    │  account-service  home-service  (shared) │
                    │  pdf-to-image-service                    │
                    │  image-to-pdf-service                    │
                    │  pdf-compressor-service                  │
                    │  pdf-to-audio-service                    │
                    │  pdf-to-word-service                     │
                    │  word-to-pdf-service                     │
                    │  edit-pdf-service                        │
                    │  sheetlab-service                        │
                    └──────────────────────────────────────────┘

                    ┌──────────────────────────────────────────┐
                    │     External APIs (outbound HTTPS)       │
                    │  ConvertAPI v2 — pdf-to-word, word-to-pdf│
                    │                  edit-pdf, sheetlab      │
                    │  Microsoft Edge TTS — pdf-to-audio       │
                    └──────────────────────────────────────────┘
```

All services run on a shared Docker bridge network (`pdf-labs-net`) and communicate only through browser-mediated navigation — there are no direct service-to-service HTTP calls, except for the profile-service which opens short-lived direct MongoDB connections to each tool service's database to aggregate activity history.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (v18 or v22 depending on service) |
| Framework | Express 4 |
| Templating | EJS |
| Database | MongoDB 7 (single instance, per-service namespaces) |
| Auth | JWT (`jsonwebtoken`) — shared secret across all services |
| Containerisation | Docker (multi-stage Alpine builds) |
| Orchestration (dev) | Docker Compose v3 |
| Orchestration (prod) | Kubernetes |
| PDF tools | Ghostscript, Poppler (`pdftocairo`, `pdftotext`, `pdfinfo`) |
| PDF generation | `pdf-lib` (image-to-pdf) |
| External APIs | ConvertAPI v2, Microsoft Edge TTS |

---

## Environment Variables

All services share `JWT_SECRET` and `MONGO_URI`. Four services additionally require `CONVERTAPI_SECRET`.

| Variable | Required By | Description |
|---|---|---|
| `MONGO_URI` | All services | MongoDB connection string for the service's own namespace |
| `JWT_SECRET` | All services | Shared JWT signing/verification secret — must be identical across all services |
| `CONVERTAPI_SECRET` | `pdf-to-word`, `word-to-pdf`, `edit-pdf`, `sheetlab` | ConvertAPI v2 secret key (free tier: 250 conversions/month) |
| `SESSION_SECRET` | `sheetlab` | express-session secret (defaults to `"sheetlab_secret"` — set in production) |
| `NODE_ENV` | All services | `development` or `production` |
| `PORT` | All services | Server port (each service has a default — see service map) |

> **Security note:** The `JWT_SECRET` shown in **[docker-compose.yml](./docker-compose.yml)** is a development default. Always replace it with a cryptographically strong random value in any non-local environment.

---

## Running the Full Stack

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose installed
- Each service branch checked out locally under `~/pdf/<service-name>`
- A [ConvertAPI](https://www.convertapi.com) account (free tier sufficient for development)

### Clone All Service Branches

```bash
# Create the working directory
mkdir -p ~/pdf && cd ~/pdf

# Clone each service branch
git clone -b account-service     https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git account-service
git clone -b home-service        https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git home-service
git clone -b profile-service     https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git profile-service
git clone -b logout-service      https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git logout-service
git clone -b tools-service       https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git tools-service
git clone -b pdf-to-image-service  https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git pdf-to-image-service
git clone -b image-to-pdf-service  https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git image-to-pdf-service
git clone -b pdf-compressor-service https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git pdf-compressor-service
git clone -b pdf-to-audio-service  https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git pdf-to-audio-service
git clone -b pdf-to-word-service   https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git pdf-to-word-service
git clone -b sheetlab-service      https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git sheetlab-service
git clone -b word-to-pdf-service   https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git word-to-pdf-service
git clone -b edit-pdf-service      https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git edit-pdf-service

# Clone the main branch (this repo) for the docker-compose.yml
cd ~ && git clone https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git pdf-labs-main
```

### Quick Start with Docker Compose

```bash
# From the directory containing docker-compose.yml
cd ~/pdf-labs-main

# Set your ConvertAPI secret (replace with your actual key)
export CONVERTAPI_SECRET=your_convertapi_secret_here

# Build and start all services
docker compose up --build

# Or run in detached mode
docker compose up --build -d
```

Once all containers are running, open your browser and navigate to:

```
http://localhost:3000
```

Create an account, log in, and you will be routed through the full platform.

### Stopping the Stack

```bash
docker compose down

# To also remove the MongoDB volume (all data)
docker compose down -v
```

---

## Authentication Model

PDF Labs uses a **shared-secret JWT** authentication model:

1. The `account-service` issues a JWT signed with `JWT_SECRET` (1-hour expiry by default) on successful login.
2. The JWT is stored in the browser's `localStorage` and appended as `?token=<jwt>` on every navigation between services.
3. Every protected route on every service verifies the token using the same `JWT_SECRET` — no token exchange or OAuth flow is needed.
4. Each service independently validates the token's structure (3 dot-separated parts) and cryptographic signature before processing any request.
5. Client-side, every service decodes the JWT `exp` claim and schedules a precise redirect back to the account-service at the moment of expiry.
6. When a user logs out, the `logout-service` issues a 60-second replacement token and redirects to the account-service after the countdown.

---

## Git Branch Structure

The project uses a **branch-per-service** model. The `main` branch is the integration root and contains only orchestration files.

```
main                    ← docker-compose.yml, README.md, k8s/ manifests
├── account-service     ← Full source for account-service
├── home-service        ← Full source for home-service
├── profile-service     ← Full source for profile-service
├── logout-service      ← Full source for logout-service
├── tools-service       ← Full source for tools-service
├── pdf-to-image-service
├── image-to-pdf-service
├── pdf-compressor-service
├── pdf-to-audio-service
├── pdf-to-word-service
├── sheetlab-service
├── word-to-pdf-service
└── edit-pdf-service
```

Each service branch contains the full service source tree including its own `Dockerfile`, `README.md`, `.dockerignore`, and `.gitignore`. Services are developed and versioned independently — changes to one service do not require touching any other branch.

---

## Contributing

1. Fork the repository
2. For service changes: check out the relevant service branch and make your changes there
3. For orchestration changes (Docker Compose, Kubernetes manifests): work on the `main` branch
4. Create a feature branch from the appropriate base: `git checkout -b feature/my-feature`
5. Commit your changes: `git commit -m "feat: describe the change"`
6. Push and open a Pull Request targeting the correct branch

Please keep service branches isolated — changes to one service's branch should not affect other branches.

---

## License

This project is licensed under the **ISC License**.

---

> Developed and maintained by [Godfrey Ifeanyi](mailto:godfreyifeanyi50@gmail.com)
