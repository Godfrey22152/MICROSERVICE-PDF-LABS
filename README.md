# PDF Labs — Account Service

> The authentication gateway microservice for the PDF Labs platform. Handles user registration, login, JWT issuance, and session management — serving as the entry point before users are routed to other services.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Run Locally (without Docker)](#run-locally-without-docker)
  - [Run with Docker](#run-with-docker)
- [Authentication Flow](#authentication-flow)
- [Security Highlights](#security-highlights)
- [Related Services](#related-services)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

The **Account Service** is a Node.js/Express microservice that powers user authentication for the [PDF Labs](https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS) platform — a multi-service PDF processing application. It is the user-facing landing page and authentication layer. After a successful login, it issues a short-lived JWT and redirects the user to the **Home Service** (`port 3500`).

---

## Architecture

The account service is one of many microservices in the PDF Labs ecosystem, all orchestrated via Docker Compose and connected through a shared bridge network (`pdf-labs-net`). MongoDB is shared across services with each service maintaining its own database namespace.

```
                     ┌─────────────────────────────────┐
                     │      PDF Labs Platform          │
                     │      (Docker Network)           │
                     └────────────┬────────────────────┘
                                  │
              ┌───────────────────▼──────────────────────────┐
              │              account-service (:3000)         │
              │  • Landing page (EJS)                        │
              │  • Register / Login API                      │
              │  • JWT issuance                              │
              └──────┬─────────────────────────┬─────────────┘
                     │                         │
           ┌─────────▼─────────┐    ┌──────────▼──────────┐
           │  MongoDB (:27017) │    │  home-service(:3500)│
           │  account-service  │    │  (post-login target)│
           └───────────────────┘    └─────────────────────┘
```

> **Note:** The full **[Docker Compose file](https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/blob/main/docker-compose.yml)** that wires all services together lives in the **root/main repository**, not in this repository.

---

## Screenshots

> Account Service application screenshots.

### Landing Page
![Landing Page](images/landing-page.png)
![Landing Page](images/landing-page2.png)

### Create Account Modal
![Create Account](images/create-account.png)

### Login Modal
![Login](images/login.png)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 15.0.0 |
| Framework | Express 4 |
| Templating | EJS |
| Database | MongoDB (via Mongoose 8) |
| Auth | JWT (`jsonwebtoken`) + `bcrypt` |
| Config | `config` module + `.env` |
| Container | Docker (multi-stage, Alpine-based) |

---

## Project Structure

```
account-service/
├── app.js                   # Express entry point
├── Dockerfile               # Multi-stage production Docker build
├── package.json
├── config/
│   └── db.js                # MongoDB connection
├── middleware/
│   ├── auth.js              # Bearer token JWT guard
│   └── sessionCheck.js      # Cookie-based session guard
├── models/
│   └── User.js              # Mongoose User schema
├── routes/
│   ├── auth.js              # POST /api/auth/register, /api/auth/login
│   └── protectedRoute.js    # GET /api/home, /api/logout
├── views/
│   └── index.ejs            # Landing page template
└── public/
    ├── css/
    │   └── styles.css
    ├── js/
    │   └── script.js        # Client-side modal & form logic
    └── images/              # Feature card images
```

---

## API Endpoints

### Public

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Renders the landing page |
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Authenticate and receive a JWT |

### Protected

| Method | Path | Guard | Description |
|---|---|---|---|
| `GET` | `/api/home` | Bearer JWT | Redirects to home-service |
| `GET` | `/api/logout` | Cookie session | Redirects to logout-service |

#### Register — `POST /api/auth/register`

**Request body:**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "yourpassword"
}
```

**Responses:**
- `201` — `Account created, You can now Login`
- `400` — `User already exists` / `All fields are required`
- `500` — `Email Already Exists`

#### Login — `POST /api/auth/login`

**Request body:**
```json
{
  "username": "john_doe",
  "password": "yourpassword"
}
```

**Responses:**
- `200` — `{ "token": "<jwt>", "redirectUrl": "http://localhost:3500" }`
- `400` — `Invalid credentials, Check Your Details and Try Again`
- `500` — `Server error`

---

## Environment Variables

Create a `.env` file in the project root (or supply these via Docker/Compose):
See **[Docker Compose file](https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/blob/main/docker-compose.yml)**

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB connection string, e.g. `mongodb://mongo:27017/account-service` |
| `JWT_SECRET` | Yes | Secret key used for signing JWTs |
| `PORT` | No | Server port (defaults to `3000`) |
| `NODE_ENV` | No | `development` or `production` |

> **Warning:** Never commit your `.env` file or real secrets to version control.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 15.0.0
- [MongoDB](https://www.mongodb.com/) instance (local or Docker)
- [Docker](https://www.docker.com/) (optional, for containerised runs)

### Run Locally (without Docker)

```bash
# 1. Clone the repository
git clone https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git
cd MICROSERVICE-PDF-LABS/account-service

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
# Then edit .env with your MONGO_URI and JWT_SECRET

# 4. Start the server
npm start
```

The service will be available at `http://localhost:3000`.

### Run with Docker

#### Build and run this service standalone

```bash
docker build -t account-service .
docker run -p 3000:3000 \
  -e MONGO_URI=mongodb://<your-mongo-host>:27017/account-service \
  -e JWT_SECRET=your_secret_here \
  account-service
```

#### Run the full PDF Labs stack

From the **root/main repository** that contains `docker-compose.yml`:

```bash
docker compose up --build
```

This starts all services together on the `pdf-labs-net` Docker network, with MongoDB on port `27017` and the account service on port `3000`.

---

## Authentication Flow

```
User fills form (EJS page)
        │
        ▼
POST /api/auth/login (account-service :3000)
        │
        ▼
  Validate credentials against MongoDB
        │
        ▼
  Sign JWT (expires in 1hr)
        │
        ▼
  Return { token, redirectUrl }
        │
        ▼
  Client stores token in localStorage
        │
        ▼
  Redirect → http://localhost:3500?token=<jwt>
        │
        ▼
  home-service validates token on every protected route
```

> **Token lifetime:** JWTs are issued with a 3600-seconds (1-Hour) expiry. Downstream services are responsible for validating them on each request.

---

## Security Highlights

- **Password hashing** — all passwords are hashed with `bcrypt` (salt rounds: 10) before storage; plaintext is never persisted.
- **JWT authentication** — stateless token-based auth; tokens are verified on every protected route using the shared `JWT_SECRET`.
- **Non-root Docker user** — the production container runs as `appuser` (non-root) inside an Alpine Linux base image for a minimal attack surface.
- **Multi-stage Docker build** — development tooling and source maps are stripped from the final image; only production artifacts are copied.
- **Input trimming & validation** — all user-submitted fields are trimmed and validated before any database operation.
- **No secrets in image** — secrets are injected at runtime via environment variables, never baked into the Docker image.

---

## Related Services

All services below are part of the PDF Labs platform and are wired together via the root `docker-compose.yml`.

| Service | Port | Description |
|---|---|---|
| `account-service` | 3000 | **This service** — auth & landing page |
| `home-service` | 3500 | Dashboard shown after login |
| `profile-service` | 4000 | User profile management |
| `logout-service` | 4500 | Session termination |
| `tools-service` | 5000 | PDF tools index |
| `pdf-to-image-service` | 5100 | PDF → Image conversion |
| `image-to-pdf-service` | 5200 | Image → PDF conversion |
| `pdf-compressor-service` | 5300 | PDF compression |
| `pdf-to-audio-service` | 5400 | PDF → Audio conversion |
| `pdf-to-word-service` | 5500 | PDF → Word conversion |
| `sheetlab-service` | 5600 | PDF ↔ Excel conversion |
| `word-to-pdf-service` | 5700 | Word → PDF conversion |
| `edit-pdf-service` | 5800 | In-browser PDF editing |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "feat: add my feature"`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

Please follow the existing code style and keep commits focused.

---

## License

This project is licensed under the **ISC License**. See the [LICENSE](LICENSE) file for details.

---

> Maintained by [Godfrey Ifeanyi](mailto:godfreyifeanyi45@gmail.com)
