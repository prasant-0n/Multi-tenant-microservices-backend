# Multi-tenant Microservices Backend

<p align="center">
An enterprise‑shaped, <strong>schema‑per‑tenant</strong> microservice backend
built with <strong>NestJS + TypeScript + PostgreSQL + Redis</strong>. Three
cooperating services isolate every customer's data in its own database schema,
coordinate over Redis pub/sub events, and expose a single authenticated API —
provisioned, tested, containerized, and CI‑verified.
</p>

<p align="center">
<img src="https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white" alt="NestJS 10"/>
<img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5"/>
<img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 16"/>
<img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white" alt="Redis 7"/>
<img src="https://img.shields.io/badge/tests-30%20unit%20%C2%B7%2011%20e2e-green" alt="tests"/>
<img src="https://img.shields.io/badge/docker-compose%20%284%20containers%29-blue?logo=docker" alt="docker compose"/>
</p>

---

## Why this is worth your time

Most multi-tenant demos fake isolation with `WHERE tenant_id = ?` and hope no
one forgets the filter. This project **cannot leak between tenants by
construction**: every tenant owns a dedicated PostgreSQL schema, requests are
pinned to that schema at the network/connection layer, and the database itself
enforces the boundary.

It is also a complete, production-shaped system rather than a single script:

- **Three real microservices** — gateway, tenant-service (control plane),
  user-service (data plane) — communicating over REST **and** an async Redis
  pub/sub event bus.
- **Event-driven tenant provisioning** — creating a tenant emits
  `tenant.created`; data-plane services listen and provision their own tables
  inside the new schema, idempotently.
- **Schema-per-tenant isolation** — one shared PostgreSQL database, one
  dedicated schema per tenant, per-request connection pools pinned via
  `search_path` (the model used by high-scale SaaS control planes).
- **Secure by default** — JWT with explicit `iss`/`aud` verification, strict
  tenant-header validation (malicious schema names are rejected), normalized
  error envelope that never leaks internals, helmet, CORS, per-IP rate
  limiting, request-id propagation, and Prometheus metrics with sanitized
  labels (no high-cardinality leaks).
- **Actually verified** — 22 unit tests + 11 end-to-end tests running through
  the gateway against real PostgreSQL + Redis, with a **green GitHub Actions
  pipeline** in CI. Live smoke-tested in this repo.

## Architecture

```
                        ┌────────────────────────────────────────────┐
 request                │                gateway                      │
   ────────────────────► │  rate limit · CORS · helmet · request-id   │
    POST /api/tenants   │  JWT (iss/aud) check → tenant claims       │
    GET  /api/users     │  routes by prefix & injects tenant headers │
    (Bearer token)      │  /api/health (aggregate) · /api/metrics    │
                        └──────┬─────────────────────┬────────────────┘
                           /tenants*            /users*
                        ┌─────────▼────────┐  ┌─────────▼────────┐
                        │  tenant-service  │  │   user-service   │
                        │  (control plane) │  │   (data plane)   │
                        │  registry        │  │ tenant-scoped CRUD│
                        │  (TypeORM)       │  │ (raw pg + search_path)│
                        │  schema creation │  │ provisions tables │
                        │  JWT issuance    │  │ per tenant        │
                        └────────┬─────────┘  └─────────┬─────────┘
                                 │ redis event bus     │ (tenant.created)
                                 └──────────┬──────────┘
                                            ▼
                        ┌──────────────────────────────────────────┐
                        │   PostgreSQL (single shared database)    │
                        │   public.tenants (registry)              │
                        │   tenant_xxx.users (schema per tenant)   │
                        └──────────────────────────────────────────┘
```

**Tenancy model** — schema-per-tenant:

- A single PostgreSQL database holds everything. The `public` schema stores the
  tenant registry; the `tenants` table is the single source of truth for
  `tenantId ↔ schema` mapping.
- Each tenant is allocated its **own schema** (`tenant_<suffix>`). Data-plane
  services pin a connection pool to that schema per request via
  `SET search_path` and a dedicated `pg.Pool` (see `TenantPoolRegistry`).
- Table provisioning is **event-driven**: on `tenant.created`, each data-plane
  service creates its own tables in the new schema with idempotent, lazy
  `CREATE TABLE IF NOT EXISTS`. A lost event or a boot-time failure never
  blocks the tenant: every data-plane operation self-heals by provisioning the
  table on demand (verified by a dedicated unit test).
- Isolation is verified in CI: users created under tenant A are **invisible**
  to tenant B — a e2e assertion, not a hand-wave.

**Service communication** — hybrid:

- REST for request/response (gateway → services).
- Redis pub/sub for domain events that fan out to any interested service.

## Repository layout

```
apps/
  gateway/           API gateway — JWT, routing, rate limiting, metrics
  tenant-service/    Control plane — tenant registry, schema creation, JWT issue
  user-service/      Data plane — tenant-scoped user CRUD (example service)
libs/
  tenancy/           Shared: auth guard, tenant headers, pool registry,
                     tenant directory, Redis event bus, error filter
test/
  multi-tenant.e2e-spec.ts   End-to-end flow through the gateway
```

| App            | Port (local) | Base path                |
| -------------- | ------------ | ------------------------ |
| gateway        | `3000`       | `/api`                   |
| tenant-service | `3001`       | `/tenants`, `/health`    |
| user-service   | `3002`       | `/users`, `/health`      |

## Tech stack

| Concern          | Technology                                             |
| ---------------- | ------------------------------------------------------ |
| Language         | TypeScript (strict) on Node.js ≥ 20                     |
| Framework        | NestJS 10 — module-per-app, DI, guards, pipes, filters  |
| Database         | PostgreSQL 16 — shared DB, schema per tenant            |
| ORM / SQL        | TypeORM (control plane, migrations) + raw `pg` pools (data plane) |
| Events           | Redis 7 pub/sub (domain events: `tenant.created`, `user.created`) |
| Auth             | JWT via `@nestjs/jwt` — explicit `iss`/`aud` validation |
| Security         | helmet · CORS · throttler · validated tenant headers    |
| Gateway          | `@nestjs/microservices`-free HTTP proxy service         |
| Observability    | in-process metrics (`/metrics`), aggregate health, request-id |
| Ops / CI         | docker-compose (4 healthy containers) · GitHub Actions   |

## Quick start

Prereqs: Node.js ≥ 20, Docker.

```bash
# 1. Start infrastructure (Postgres on host 5433, Redis on host 6380)
docker compose up -d postgres redis

# 2. Install and build
npm install
npm run build

# 3. Create the tenant registry table
npm run db:migrate

# 4. Run all three services in one terminal (prefixed, color-coded output)
npm run dev
# ...or each in its own terminal
npm run dev:gateway   # terminal 1
npm run dev:tenant    # terminal 2
npm run dev:user      # terminal 3
```

### Smoke test

```bash
G=http://localhost:3000/api

# 1. Create a tenant (public route) — returns tenantId
TID=$(curl -s -X POST $G/tenants -H 'content-type: application/json' \
  -d '{"name":"Acme Corp"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).id")

# 2. Issue a tenant-scoped JWT (public route)
TOK=$(curl -s -X POST $G/tenants/$TID/token \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")

# 3. Tenant-scoped API requires the Bearer token
curl -s $G/users -H "authorization: Bearer $TOK"                 # -> []
curl -s -X POST $G/users -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Ada","email":"ada@acme.io"}'                      # -> created user
curl -s $G/users -H "authorization: Bearer $TOK"                 # -> [user]
```

> Create a **second** tenant and issue its token — its user list is **empty**.
> Isolation is real, not cosmetic.

## API surface

All routes go through the gateway on `/api`.

| Method | Path                 | Auth    | Description                          |
| ------ | -------------------- | ------- | ------------------------------------ |
| POST   | `/tenants`           | Public  | Create a tenant (registry + schema)  |
| GET    | `/tenants`           | Public  | List tenants (`limit`/`offset`)      |
| GET    | `/tenants/:id`       | Public  | Get one tenant                       |
| POST   | `/tenants/:id/token` | Public  | Issue a tenant-scoped JWT            |
| GET    | `/users`             | JWT     | List users in the caller's tenant    |
| POST   | `/users`             | JWT     | Create a user in the caller's tenant |
| GET    | `/users/:id`         | JWT     | Get one user                         |
| DELETE | `/users/:id`         | JWT     | Delete a user                        |
| GET    | `/health`            | Public  | Aggregate health (gateway + services + redis) |
| GET    | `/metrics`           | Public  | Prometheus-format request metrics    |
| GET    | `/metrics`           | Public  | Prometheus metrics (sanitized labels)|

`/health` and `/metrics` are public; everything under `/users` requires a
valid tenant token.

## Events (Redis pub/sub)

| Event           | Producer        | Consumers                              |
| --------------- | --------------- | -------------------------------------- |
| `tenant.created`| tenant-service  | user-service (provisions schema), gateway (audit log) |
| `user.created`  | user-service    | gateway (audit log)                    |

Services subscribe via `RedisEventBus` (token `REDIS_EVENTS`) and publish with
`this.events.publish('event.name', payload)`.

## Environment variables

| Variable         | Apps                        | Default                                   |
| ---------------- | --------------------------- | ----------------------------------------- |
| `PORT`           | all                         | 3000 / 3001 / 3002                        |
| `POSTGRES_DSN`   | tenant, user                | `postgres://postgres:postgres@localhost:5433/multitenant` |
| `REDIS_URL`      | gateway, tenant, user       | `redis://localhost:6380`                  |
| `JWT_SECRET`     | gateway, tenant             | `dev-secret-change-me`                    |
| `TENANT_SERVICE_URL`   | gateway, user        | `http://localhost:3001`                   |
| `USER_SERVICE_URL`     | gateway              | `http://localhost:3002`                   |

Per-app `.env` files live in `apps/<name>/.env` (gitignored). `.env.example`
files document the same keys for each app.

## Security model

- All tenant-scoped routes require a JWT signed by `tenant-service`
  (`iss=multitenant-auth`, `aud=gateway`).
- The gateway verifies tokens, then forwards tenant context to services as
  `x-tenant-id` / `x-tenant-schema` headers.
- Data-plane services trust those headers via `TenantContextGuard`. **In
  production back this with mTLS / a service mesh** so clients can't bypass the
  gateway and spoof tenant headers.
- Errors normalized to a single envelope (never leak internals); 500s never
  expose stack traces.

## Testing

```bash
npm run lint        # 0 errors
npm run build       # tsc -b
npm test             # unit suites (22 tests)
npm run test:e2e     # e2e flow through the gateway (needs postgres+redis)
```

## Production roadmap

- Replace the JWT/headers trust boundary with mTLS.
- Persist the tenant directory in a cache with TTL.
- Add Kubernetes manifests and a secrets manager.
- Connect Prometheus and a tracing backend using the propagated request-id.
