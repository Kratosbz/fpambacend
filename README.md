# AssetSpatial Backend

Production Node.js/Express API for the Nigerian Federal Public Asset Management Platform.

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 | `node --version` to check |
| MongoDB | ≥ 6 | Local install or Atlas free tier |
| Redis | ≥ 7 | **Optional** for local dev — falls back to memory if absent |
| Tesseract | ≥ 5 | **Optional** — only needed for OCR scanning |

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set MONGO_URI and JWT_SECRET

# 3. Seed the database (creates admin user + role configs)
npm run seed
# Default credentials: admin@assetspatial.gov.ng / ChangeMe123!

# 4. Start the server
npm run dev        # with nodemon hot-reload
# or
npm start          # plain node
```

Server starts on **http://localhost:3001**

Health check: `curl http://localhost:3001/health`

## Install MongoDB Locally

**macOS:** `brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community`

**Ubuntu/Debian:**
```bash
sudo apt install gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update && sudo apt install -y mongodb-org
sudo systemctl start mongod
```

**Windows:** Download installer from https://www.mongodb.com/try/download/community

**Or use MongoDB Atlas (free, no install):**
1. Create free cluster at https://cloud.mongodb.com
2. Set `MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/assetspatial` in `.env`

## Install Redis (Optional)

Redis is only needed for:
- Distributed rate limiting across multiple server instances
- OCR/Excel background job queues (without Redis, jobs run synchronously)

**macOS:** `brew install redis && brew services start redis`

**Ubuntu:** `sudo apt install redis-server && sudo systemctl start redis`

**Windows:** https://github.com/tporadowski/redis/releases

Without Redis, the server starts fine — rate limiting uses in-memory store and OCR runs inline.

## Install Tesseract OCR (Optional)

Only needed if you use the OCR scanner feature.

**Ubuntu:** `sudo apt install tesseract-ocr tesseract-ocr-yor tesseract-ocr-hau`

**macOS:** `brew install tesseract`

**Windows:** https://github.com/UB-Mannheim/tesseract/wiki

## Docker (easiest for full stack)

```bash
# Starts API + MongoDB + Redis together
docker compose up -d

# Seed the database
docker compose exec api npm run seed
```

## API Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/auth/login` | Sign in → JWT token |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/auth/me` | Current user |
| `GET/POST` | `/api/assets` | List / create assets |
| `GET/PUT/DELETE` | `/api/assets/:id` | Get / update / delete asset |
| `POST` | `/api/assets/:id/maintenance` | Add maintenance entry |
| `PUT` | `/api/assets/:id/valuation` | Set valuation |
| `GET/POST/DELETE` | `/api/assets/:id/photos` | Asset photos (GridFS) |
| `GET/POST/DELETE` | `/api/assets/:id/documents` | Asset documents (GridFS) |
| `GET/POST/DELETE` | `/api/assets/:id/excel` | Asset Excel files (GridFS) |
| `GET` | `/api/assets/export` | Export CSV / JSON / GeoJSON / XLSX |
| `GET` | `/api/assets/spatial/near` | Assets near a point |
| `POST` | `/api/assets/spatial/within` | Assets within polygon |
| `GET` | `/api/analytics/dashboard` | Dashboard KPIs |
| `GET` | `/api/analytics/by-type` | Count by asset type |
| `GET` | `/api/analytics/condition-breakdown` | Count by condition |
| `GET` | `/api/analytics/by-state` | Count by state |
| `GET` | `/api/analytics/captures-over-time` | Daily capture counts |
| `POST` | `/api/ocr/scan` | Upload file → OCR job |
| `GET` | `/api/ocr/jobs/:jobId` | Poll OCR job status |
| `GET/POST` | `/api/users` | List / create users (admin) |
| `PUT` | `/api/users/:id/permissions` | Override user permissions |
| `GET/PUT` | `/api/users/role-config/:role` | Role permission defaults |
| `GET` | `/api/audit` | Paginated audit log |
| `GET/PUT` | `/api/settings` | Platform settings |

## Connecting the Frontend

Set `API_BASE` in `api.js` (frontend) to point at this server:

```js
const API_BASE = 'http://localhost:3001/api';
```

Or serve the frontend HTML files with Live Server (VS Code extension) on port 5500 — the backend already allows `http://localhost:5500` as a CORS origin.
