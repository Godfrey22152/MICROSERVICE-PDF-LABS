# PDF Labs — PDF Compressor Service

> The PDF compression microservice for the PDF Labs platform. Reduces PDF file sizes across six selectable quality presets using the **ConvertAPI** cloud compression engine — no local binaries required, no shell execution, and no Ghostscript dependency. Displays original size, compressed size, bytes saved, and percentage reduction for every file.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Screenshots](#screenshots)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Compression Presets](#compression-presets)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Run Locally (without Docker)](#run-locally-without-docker)
  - [Run with Docker](#run-with-docker)
- [Compression Pipeline](#compression-pipeline)
- [Session & Authentication Flow](#session--authentication-flow)
- [Security Highlights](#security-highlights)
- [Related Services](#related-services)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

The **PDF Compressor Service** is a Node.js/Express microservice that compresses PDF files for the [PDF Labs](https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS) platform. Compression is performed via the **[ConvertAPI](https://www.convertapi.com/pdf-to-compress)** cloud API — the uploaded PDF is transmitted securely using `multipart/form-data` with a `Bearer` token, and the compressed PDF is returned as base64 in the JSON response and written to the local filesystem for download.

This service is responsible for:

- Rendering the PDF Compressor page (EJS) with the user's compression history and size stats
- Accepting single PDF uploads (up to 100 MB) via drag-and-drop or file picker, with client and server-side type validation
- Sending the uploaded PDF to the ConvertAPI compress endpoint with the user's chosen preset
- Reporting exact original size, compressed size, bytes saved, and percentage reduction per file
- Persisting a `CompressedFile` record to MongoDB linked to the authenticated user
- Serving compressed PDFs as direct downloads scoped by a `uuid`-based output directory
- Allowing users to delete individual records and their associated output directories
- AJAX-first form submission with a real upload progress bar and inline result card injection

---

## Architecture

The compressor service sends each uploaded PDF to ConvertAPI over HTTPS using Node's built-in `https` module — no external HTTP library is needed. The compressed PDF is returned in the API response, decoded from base64, and stored locally in an `outputs/<uuid>/` directory for download.

```
                  ┌─────────────────────────────────────────────────┐
                  │               PDF Labs Platform                 │
                  │               (Docker Network)                  │
                  └──────────────────┬──────────────────────────────┘
                                     │  Token-bearing request from tools-service
         ┌───────────────────────────▼───────────────────────────────────────┐
         │              pdf-compressor-service (:5300)  ◄── THIS             │
         │  • Upload PDF via multer (single file, 100 MB limit)              │
         │  • POST multipart/form-data → ConvertAPI compress endpoint        │
         │  • Decode base64 response → write to outputs/<uuid>/              │
         │  • Persist CompressedFile record to MongoDB                       │
         │  • Serve per-file download routes                                 │
         └──────┬──────────────────────────────────────┬─────────────────────┘
                │                                      │
   ┌────────────▼───────────────┐        ┌─────────────▼────────────────────┐
   │  MongoDB (:27017)          │        │  Local filesystem                │
   │  pdf-compressor-service DB │        │  uploads/  (multer staging)      │
   │  • CompressedFile schema   │        │  outputs/  (uuid dirs)           │
   └────────────────────────────┘        └──────────────────────────────────┘

                              ┌──────────────────────────────────┐
                              │  ConvertAPI (cloud)              │
                              │  POST /convert/pdf/to/compress   │
                              │  Auth: Bearer <CONVERTAPI_SECRET>│
                              │  Preset: none|text|archive|      │
                              │          web|ebook|printer       │
                              └──────────────────────────────────┘
```

> **Note:** The **[docker-compose.yml file](https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS/blob/main/docker-compose.yml)** that wires all services together lives in the **root/main repository**, not in this repository.

---

## Screenshots

> PDF Compressor application screenshots.

### PDF Compressor Page
![Compressor Page](images/compressor-page.png)

### Compression Preset Selection Cards
![Compression Presets](images/compression-level-cards.png)

### Compressed Files History Grid
![History Grid](images/compressed-files-grid.png)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 15.0.0 |
| Framework | Express 4 |
| Templating | EJS |
| Database | MongoDB (via Mongoose 8) |
| File uploads | `multer` (disk storage, PDF-only filter, 100 MB limit) |
| PDF compression | **[ConvertAPI](https://www.convertapi.com/pdf-to-compress)** — cloud-based, via Node built-in `https` |
| HTTP to ConvertAPI | Node.js built-in `https` module — no external HTTP library |
| Auth | JWT (`jsonwebtoken`) — Bearer header, query param, or body |
| File ID | `uuid` v11 |
| Container | Docker (multi-stage, Alpine 3.23 — no Ghostscript dependency) |

---

## Project Structure

```
pdf-compressor-service/
├── server.js                         # Express entry point
├── Dockerfile                        # Multi-stage build; no Ghostscript — compression via ConvertAPI
├── package.json
├── config/
│   └── db.js                         # MongoDB connection with disconnect/error listeners
├── controllers/
│   └── pdfController.js              # Render, compress (ConvertAPI), download, delete
├── middleware/
│   └── sessionCheck.js               # JWT guard — Bearer, query, body; HTML redirect fallback
├── models/
│   └── CompressedFile.js             # Mongoose schema with size stats and compression metadata
├── routes/
│   └── pdfRoutes.js                  # GET/POST /pdf-compressor, GET /download/:id, DELETE /:id
├── utils/
│   ├── errorHandler.js               # globalErrorHandler (ConvertAPI / server errors)
│   └── fileUtils.js                  # sanitizeFilename, formatBytes
├── views/
│   └── pdf-compressor.ejs            # Compressor page with preset cards and file history
├── public/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── main.js                   # Session, drag-drop, AJAX submit, progress, delete modal
│       └── eventlisteners.js         # Navigation to other PDF Labs services
├── uploads/                          # Temporary multer staging (auto-created, gitignored)
└── outputs/                          # Compressed PDFs as outputs/<uuid>/ (auto-created, gitignored)
```

---

## Compression Presets

Six presets map directly to ConvertAPI's `Preset` parameter, each targeting a different balance of file size and image quality. When a preset is selected, it overrides all other advanced compression options.

| Preset | Image DPI | Quality | Expected Reduction | Best For |
|---|---|---|---|---|
| **Not Set** (`none`) | Original | Original | 5–15% | Structural optimisation only — fonts subsetted, duplicates removed, streams optimised |
| **Text** (`text`) | 20 dpi | Lowest | 80–95% | Text-only documents; email, archiving |
| **Archive** (`archive`) | 40 dpi | Low | 70–90% | Long-term storage, minimal filesize |
| **Web** (`web`) *(default)* | 75 dpi | Medium | 50–70% | Web sharing, email attachments |
| **Ebook** (`ebook`) | 150 dpi | High | 30–50% | E-readers, tablets, digital distribution |
| **Printer** (`printer`) | 300 dpi | High | 10–30% | Desktop printing, high-fidelity output |

> **Note:** Reduction percentages are estimates. Actual results depend on the content of the source PDF — image-heavy PDFs compress far more than text-only PDFs. PDFs that are already optimised may show little or no reduction.

---

## API Endpoints

All routes are prefixed with `/tools`. Session-protected routes require a valid JWT.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/tools/pdf-compressor` | JWT | Render the compressor page with user's file history |
| `POST` | `/tools/pdf-compressor` | JWT | Upload a PDF and compress it at the selected preset |
| `GET` | `/tools/pdf-compressor/download/:id` | None | Download the compressed PDF by UUID |
| `DELETE` | `/tools/pdf-compressor/:id` | JWT | Delete a compression record and its output directory |

---

### `GET /tools/pdf-compressor`

```
GET http://localhost:5300/tools/pdf-compressor?token=<jwt>
```

Queries all `CompressedFile` records for the authenticated user (sorted newest-first) and renders the page with the preset cards and file history grid.

**Responses:**
- `200` — Renders `pdf-compressor.ejs`
- `302` — Redirect to `http://localhost:3000` (invalid/missing token, HTML client)
- `401` — Structured JSON auth error (API client)

---

### `POST /tools/pdf-compressor`

Accepts `multipart/form-data`. Called via AJAX (`X-Requested-With: XMLHttpRequest`) from the browser; returns JSON for card injection, or redirects on non-XHR fallback.

```
POST http://localhost:5300/tools/pdf-compressor?token=<jwt>
Content-Type: multipart/form-data

pdf:               <file>   (PDF only, max 100 MB)
compressionLevel:  none | text | archive | web | ebook | printer
```

**Success response (XHR):**
```json
{
  "fileId": "<uuid>",
  "originalName": "report.pdf",
  "sanitizedName": "report",
  "compressionLevel": "web",
  "compressionLabel": "Web",
  "originalSize": 5242880,
  "compressedSize": 2097152,
  "savedBytes": 3145728,
  "savedPercent": 60.0,
  "downloadUrl": "/tools/pdf-compressor/download/<uuid>?file=report_compressed.pdf",
  "filename": "report_compressed.pdf"
}
```

**Error responses:**
- `400` — No file uploaded / invalid preset / non-PDF file
- `401` — Auth error (`NO_TOKEN`, `TOKEN_EXPIRED`, `INVALID_TOKEN`)
- `500` — `CONVERTAPI_SECRET` not set / unexpected server error
- `502` — ConvertAPI returned an error or unexpected response

---

### `GET /tools/pdf-compressor/download/:id`

No authentication required. Scoped by UUID so files are not guessable.

```
GET http://localhost:5300/tools/pdf-compressor/download/<uuid>?file=report_compressed.pdf
```

**Responses:**
- `200` — File download (`res.download`)
- `400` — Missing `file` query parameter
- `404` — File not found on disk

---

### `DELETE /tools/pdf-compressor/:id`

Verifies the record belongs to the authenticated user before deleting both the MongoDB document and the entire `outputs/<uuid>/` directory.

```
DELETE http://localhost:5300/tools/pdf-compressor/<uuid>?token=<jwt>
Authorization: Bearer <jwt>
```

**Responses:**
- `200` — `"File deleted successfully."`
- `404` — `"File not found or you do not have permission to delete it."`
- `500` — `"Server error while deleting file."`

---

## Environment Variables

Create a `.env` file in the project root (or supply via Docker Compose):

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB connection string, e.g. `mongodb://mongo:27017/pdf-compressor-service` |
| `JWT_SECRET` | Yes | Secret key for verifying JWTs — must match the account-service |
| `CONVERTAPI_SECRET` | Yes | Your ConvertAPI API token — obtain from [convertapi.com/a/authentication](https://www.convertapi.com/a/authentication) |
| `PORT` | No | Server port (defaults to `5300`) |

### Supplying `CONVERTAPI_SECRET` via Docker Compose

The API token is injected at runtime — it is never baked into the Docker image. In your root `docker-compose.yml`, add it to the `pdf-compressor-service` environment block:

```yaml
services:
  pdf-compressor-service:
    environment:
      - MONGO_URI=mongodb://mongo:27017/pdf-compressor-service
      - JWT_SECRET=your_jwt_secret
      - CONVERTAPI_SECRET=your_convertapi_token
```

> **Warning:** Never commit your `.env` file or real secrets to version control.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 15.0.0
- [MongoDB](https://www.mongodb.com/) instance (local or Docker)
- A **ConvertAPI account** and API token — [sign up free](https://www.convertapi.com/a/signup) (250 free conversions included, no credit card required)
- [Docker](https://www.docker.com/) (optional)
- A valid JWT issued by the **account-service**

> **No local binary installation required.** There is no Ghostscript dependency — compression is handled entirely by ConvertAPI.

### Run Locally (without Docker)

```bash
# 1. Clone the repository
git clone https://github.com/Godfrey22152/MICROSERVICE-PDF-LABS.git
cd MICROSERVICE-PDF-LABS/pdf-compressor-service

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
# Edit .env — set MONGO_URI, JWT_SECRET, and CONVERTAPI_SECRET

# 4. Start the server
npm start
```

The service will be available at `http://localhost:5300/tools/pdf-compressor`.

> The `uploads/` and `outputs/` directories are created automatically at runtime and are excluded from version control.

### Run with Docker

The Docker image requires no system-level binaries — no Ghostscript, no ImageMagick. The runtime stage only installs `libstdc++`, making the final image significantly smaller than the previous version.

#### Build and run this service standalone

```bash
docker build -t pdf-compressor-service .
docker run -p 5300:5300 \
  -e MONGO_URI=mongodb://<your-mongo-host>:27017/pdf-compressor-service \
  -e JWT_SECRET=your_jwt_secret \
  -e CONVERTAPI_SECRET=your_convertapi_token \
  pdf-compressor-service
```

#### Run the full PDF Labs stack

From the **root/main repository** that contains `docker-compose.yml`:

```bash
docker compose up --build
```

---

## Compression Pipeline

```
User uploads PDF via drag-drop or file picker
        │  Client validates: only application/pdf accepted
        │
        ▼
POST /tools/pdf-compressor  (multipart/form-data, XHR)
        │
        ▼
  sessionCheck validates JWT server-side
        │
        ▼
  multer: saves PDF to uploads/<temp>
  multer fileFilter: rejects non-PDF MIME types before controller runs
        │
        ▼
  pdfController.compressPdf:
    • Reads compressionLevel from body → looks up COMPRESSION_LEVELS[level]
    • Reads uploaded file into memory as Buffer
    • Deletes temp file from uploads/
    • Generates uuid → creates outputs/<uuid>/ directory
    │
    ▼
  Builds multipart/form-data body (pure Node — no external library):
    ┌──────────────────────────────────────────────────────┐
    │  Preset: <none|text|archive|web|ebook|printer>       │
    │  File:   <PDF binary, multipart attachment>          │
    │  (+ structural flags for "none" preset)              │
    └──────────────────────────────────────────────────────┘
        │
        ▼
  https.request → POST https://v2.convertapi.com/convert/pdf/to/compress
    Authorization: Bearer <CONVERTAPI_SECRET>
    Content-Type:  multipart/form-data; boundary=...
        │
        ▼
  ConvertAPI processes and returns:
    { "Files": [{ "FileData": "<base64-encoded PDF>" }] }
        │
        ├─ HTTP 4xx/5xx → 502 JSON error to client
        └─ HTTP 200 → decode FileData → write to outputs/<uuid>/<name>_compressed.pdf
        │
        ▼
  Compute stats:
    compressedSize = fs.statSync(outputPath).size
    savedBytes     = max(0, originalSize - compressedSize)
    savedPercent   = (savedBytes / originalSize) × 100
        │
        ▼
  Save CompressedFile to MongoDB
        │
        ├─ XHR:     res.json(payload) → appendCompressedCard() injects card into DOM
        └─ non-XHR: res.redirect(/tools/pdf-compressor?token=...)
```

### ConvertAPI Request Details

| Detail | Value |
|---|---|
| Endpoint | `POST https://v2.convertapi.com/convert/pdf/to/compress` |
| Authentication | `Authorization: Bearer <CONVERTAPI_SECRET>` header |
| Content-Type | `multipart/form-data` |
| Preset field | `Preset` (singular) |
| File field | `File` (binary attachment) |
| Response | JSON — `Files[0].FileData` base64-encoded compressed PDF |
| HTTP client | Node.js built-in `https` module — no `node-fetch`, no `form-data` package |

---

## Session & Authentication Flow

```
User arrives at /tools/pdf-compressor?token=<jwt>
        │
        ▼
  sessionCheck middleware: structural check (3 parts) + jwt.verify()
        │
   ┌────┴──────────────────────────┐
   │ Invalid / expired / no token  │  → HTML: redirect to :3000
   │                               │  → XHR:  401 JSON error
   └───────────────────────────────┘
        │ Valid
        ▼
  controller.renderCompressorPage → CompressedFile.find({ userId }) → render page
        │
        ▼
  Client (main.js):
    • URL token → localStorage.setItem('token', urlToken)
    • checkSession() decodes exp → setTimeout at exact expiry moment
    • Expired/tampered → handleAuthError() → clears token → redirect to :3000

  User clicks preset card  →  radio input toggled + .selected class + info strip updates
  User submits form (XHR, X-Requested-With: XMLHttpRequest)
        │
        ├─ Real upload progress via xhr.upload events (0–40%)
        ├─ Simulated progress while ConvertAPI processes (40–90%)
        │
        ├─ sessionCheck validates token again server-side
        │
        ├─ 401 → handle401() → typed message → handleAuthError()
        │
        └─ 200 → appendCompressedCard(payload)
                   Injects card with original size, compressed size,
                   saved bytes, and % reduction into the DOM

  User clicks delete button
        │
        ▼
  showConfirmationModal() — dynamically built promise-based modal
        │
        ├─ Cancelled → no action
        └─ Confirmed → DELETE /tools/pdf-compressor/:id?token=<jwt>
                          → card.remove() → grid cleanup if empty
```

---

## Security Highlights

- **ConvertAPI Bearer auth** — the API token is sent as an `Authorization: Bearer` header on every outbound request; it is never exposed to the browser or included in any client-side code.
- **Secret injected at runtime** — `CONVERTAPI_SECRET` is supplied via Docker Compose environment variables and is never baked into the Docker image.
- **Multer MIME type enforcement** — the `fileFilter` rejects any upload whose `mimetype` is not `application/pdf` before the file reaches the controller, even if the client-side check was bypassed.
- **Client-side type validation** — the drag-and-drop handler and `input[type=file]` change listener both validate `application/pdf` MIME type immediately, with toast feedback before any upload is attempted.
- **Temp file cleanup on all paths** — the uploaded file is read into memory and deleted from `uploads/` before the ConvertAPI request is made, regardless of the outcome.
- **User-scoped delete** — `deleteCompressedFile` queries MongoDB with both `fileId` AND `userId`, preventing one user from deleting another user's files.
- **UUID-scoped output directories** — download routes are scoped by a `uuid`-based directory name, making output files non-guessable without the exact ID.
- **No shell execution** — the service makes no `child_process.exec` or `spawn` calls; there is no shell injection surface.
- **Dual-layer token validation** — `sessionCheck` verifies the JWT server-side on every protected route; `main.js` independently schedules a precise client-side expiry redirect.
- **HTML/API dual response mode** — all auth and error paths check `req.xhr` / `X-Requested-With` to return either a redirect or structured JSON without leaking information across modes.
- **Non-root Docker user** — the production container runs as `appuser` (non-root) on Alpine Linux.
- **Multi-stage Docker build** — dev tooling, source maps, and docs are stripped; only production artifacts land in the final image.
- **No secrets in image** — `MONGO_URI`, `JWT_SECRET`, and `CONVERTAPI_SECRET` are injected at runtime via environment variables.

---

## Related Services

All services below are part of the PDF Labs platform and are wired together via the root `docker-compose.yml`.

| Service | Port | Description |
|---|---|---|
| `account-service` | 3000 | Auth & landing page — issues JWTs |
| `home-service` | 3500 | Authenticated dashboard |
| `profile-service` | 4000 | User profile management |
| `logout-service` | 4500 | Session termination |
| `tools-service` | 5000 | Authenticated tools hub |
| `pdf-to-image-service` | 5100 | PDF → Image conversion |
| `image-to-pdf-service` | 5200 | Image → PDF conversion |
| `pdf-compressor-service` | 5300 | **This service** — PDF compression via ConvertAPI |
| `pdf-to-audio-service` | 5400 | PDF → Audio conversion |
| `pdf-to-word-service` | 5500 | PDF → Word conversion |
| `sheetlab-service` | 5600 | PDF ↔ Excel conversion |
| `word-to-pdf-service` | 5700 | Word → PDF conversion |
| `edit-pdf-service` | 5800 | Rotate, watermark, merge, split, protect, unlock |

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

> Maintained by [Godfrey Ifeanyi](mailto:godfreyifeanyi50@gmail.com)
