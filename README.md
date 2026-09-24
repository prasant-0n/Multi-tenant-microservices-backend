# Multi-tenant Microservices Backend

> **Schema-per-tenant NestJS microservices backend** — three cooperating
> TypeScript services (API gateway + control plane + data plane) that isolate
> every customer tenant into its own PostgreSQL schema, communicate over REST +
> Redis pub/sub events, and ship with Docker, CI, and a green end-to-end test
> suite.

[![CI](https://github.com/prasant-0n/Multi-tenant-microservices-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/prasant-0n/Multi-tenant-microservices-backend/actions/workflows/ci.yml)
[![release](https://img.shields.io/badge/release-v0.1.0-6f42c1)](https://github.com/prasant-0n/Multi-tenant-microservices-backend/releases/tag/v0.1.0)
![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![NestJS](https://img.shields.io/badge/NestJS-10-E0234E)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1)
![Redis](https://img.shields.io/badge/Redis-7-DC382D)
![Docker](https://img.shields.io/badge/Docker-2496ED)
[![License MIT](https://img.shields.io/badge/license-MIT-3da639)](https://github.com/prasant-0n/Multi-tenant-microservices-backend/blob/main/LICENSE)

---

## Why this project is worth a look

Most "multi-tenant" demos fake isolation by scattering `WHERE tenant_id = ?`
filters through the code and hoping nobody forgets one. This project does not
hope — it makes isolation **structurally impossible to get wrong** by giving
every tenant its own PostgreSQL schema locked to a dedicated connection pool.
A missed `WHERE` clause cannot leak another tenant's rows because the rows don't
share a table in the first place.

It is built the way a real team would hand it off for production review:

- **Schema-per-tenant data isolation** without per-tenant database costs —
  one shared Postgres, many namespaces.
- **A gateway** that owns authentication (JWT with `iss`/`aud`, rate limiting,
  CORS, helmet, request-id tracing, metrics) and hands every service an already-
  authenticated tenant context — no service re-implements auth.
- **Event-driven provisioning** over a Redis pub/sub bus: create a tenant,
  control plane provisions its schema and emits `tenant.created`; data-plane
  services subscribe and build their tables inside that schema automatically.
- **Self-healing**: provisioning is idempotent and re-runs on boot and on any
  cold sync, so a missed event never leaves a tenant half-built.
- **Real migrations** (TypeORM migrations that run against a dedicated
  registry, `synchronize: false`), a full query-string-safe Prometheus metrics
  endpoint, aggregate health, and an error envelope that never leaks internals.
- **Verified end-to-end**, not just compiles: 30 unit tests + 11 e2e tests
  running against Postgres 16 + Redis 7, all green in CI on GitHub.

## Architecture

```
                        ┌────────────────────────────────────────────┐
 request                │                gateway                      │
   ────────────────────► │  rate limit · CORS · helmet · request-id    │
    POST /api/tenants    │  JWT (iss/aud) check → tenant claims        │
    GET  /api/users      │  routes by prefix & injects tenant headers  │
    (Bearer token)       │  /api/health (aggregate) · /api/metrics     │
                         └──────┬─────────────────────┬────────────────┘
                            /tenants*            /users*
                         ┌─────────▼────────┐  ┌─────────▼────────┐
                         │  tenant-service  │  │   user-service   │
                         │  (control plane) │  │   (data plane)   │
                         │ registry (TypeORM│  │ tenant-scoped CRUD│
                         │ + migrations)    │  │ via search_path   │
                         │ schema creation  │  │ pool (raw pg)     │
                         │ JWT issuance     │  │ provisions tables │
                         └────────┬─────────┘  └─────────┬─────────┘
                                  │ tenant.created       │ tenant.created
                                  └──────────┬───────────┘   user.created
                                         ┌───▼────────────┐
                                         │  Redis pub/sub │
                                         └────────────────┘
                         ┌────────────────────────────────────────────────┐
                         │           PostgreSQL (shared database)         │
                         │   public.tenants (registry)                    │
                         │   tenant_xxxx.users (one schema per tenant)    │
                         └────────────────────────────────────────────────┘
```

**Tenancy model** — schema-per-tenant:

- A single PostgreSQL database holds everything. The `public` schema stores the
  tenant registry (`tenants` table).
- Each tenant owns a dedicated schema (`tenant_<suffix>`) that contains only
  that tenant's tables.
- Data-plane services resolve their working schema per request and pin a
  connection pool to it via `SET search_path` (see `TenantPoolRegistry`).
- Table provisioning is event-driven: on `tenant.created`, each data-plane
  service creates its own tables in the new schema (idempotent DDL), and they
  cold-sync from the control plane on startup (`TenantDirectory`).

**Service communication** — hybrid:

- **REST** for synchronous request/response (gateway → services).
- **Redis pub/sub** for domain events (`tenant.created`, `user.created`) that
  fan out to any interested service.

## Repository layout

```
apps/
  gateway/           API gateway — JWT, routing, rate limiting, health, metrics
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

## Quick start (local development)

Prerequisites: Node.js ≥ 20, Docker.

```bash
# 1. Infrastructure (Postgres on host 5433, Redis on host 6380)
docker compose up -d postgres redis

# 2. Install + build
npm install
npm run build

# 3. Migrate the tenant registry
npm run db:migrate

# 4. Run all three services (one command, prefixed output)
npm run dev

# ...or each in its own terminal
npm run dev:tenant   # terminal 1
npm run dev:user     # terminal 2
npm run dev:gateway  # terminal 3
```

### Smoke test

```bash
G=http://localhost:3000/api

# create a tenant (public route)
curl -s -X POST $G/tenants -H 'content-type: application/json' \
  -d '{"name":"Acme Corp"}'

# copy <tenantId>, then get a tenant-scoped JWT
curl -s -X POST $G/tenants/<tenantId>/token

# tenant-scoped API (all "users" routes require a token)
curl -s $G/users -H "authorization: Bearer <token>"          # -> []
curl -s -X POST $G/users \
  -H "authorization: Bearer <token>" \
  -H 'content-type: application/json' \
  -d '{"name":"Ada","email":"ada@acme.io"}'                  # -> created user
curl -s $G/users -H "authorization: Bearer <token>"          # -> [user]
```

> Create a second tenant with a separate token and the user list comes back
> **empty** — data is provably isolated per tenant.

## Full-stack Docker Compose

Runs everything (apps included) with a single command:

```bash
docker compose up -d --build
```

- gateway on `http://localhost:3000`
- migrations run automatically before `tenant-service` starts
- shared secret for JWT signing: set `JWT_SECRET` in the environment (see
  `.env.example`)

## API surface (through the gateway, port 3000)

```
POST   /api/tenants                 create tenant → returns tenant + schemaId
POST   /api/tenants/:id/token       issue a tenant-scoped JWT
POST   /api/tenants/:id             duplicate-name guard (400)
GET    /api/tenants                 list (offset/limit)
GET    /api/tenants/:id             fetch one
GET    /api/health                  aggregate health (gateway + services + redis)
GET    /api/metrics                 Prometheus-format metrics
GET    /api/users                   list users in the caller's tenant (auth)
POST   /api/users                   create user in the caller's tenant (auth)
GET    /api/users/:id               fetch one user (auth)
DELETE /api/users/:id               remove one user (auth)
```

All `/api/users*` routes require `authorization: Bearer <token>`; `/api/tenants*
` (except token issuance) and `/tenants` are public control-plane routes. Health
and metrics are always public.

## Events (Redis pub/sub)

| Event           | Producer        | Consumers              |
| --------------- | --------------- | ---------------------- |
| `tenant.created`| tenant-service  | user-service (provisions schema), gateway (audit log) |
| `user.created`  | user-service    | gateway (audit log)    |

Subscribe with `RedisEventBus` (token `REDIS_EVENTS`) and publish with
`this.events.publish('event.name', payload)`.

## Environment variables

| Variable            | Apps                      | Default                    |
| ------------------- | ------------------------- | -------------------------- |
| `PORT`              | all                       | 3000 / 3001 / 3002         |
| `POSTGRES_DSN`      | tenant, user              | `postgres://postgres:postgres@localhost:5433/multitenant` |
| `REDIS_URL`         | gateway, tenant, user     | `redis://localhost:6380`   |
| `JWT_SECRET`        | gateway, tenant           | `dev-secret-change-me`     |
| `TENANT_SERVICE_URL`| gateway, user             | `http://localhost:3001`    |
| `USER_SERVICE_URL`  | gateway                   | `http://localhost:3002`    |
| `RATE_LIMIT_TTL_MS` | gateway                   | `60000`                    |
| `RATE_LIMIT_MAX`    | gateway                   | `120`                      |
| `ENABLE_CORS`       | gateway                   | `false`                    |
| `CORS_ORIGINS`      | gateway                   | `*`                        |

## Security model

- All tenant-scoped routes require a JWT signed by `tenant-service`
  (`iss=multitenant-auth`, `aud=gateway`). The gateway verifies the token, then
  forwards tenant context as `x-tenant-id` / `x-tenant-schema` headers to the
  data-plane services.
- Data-plane services trust those headers via `TenantContextGuard`. **In
  production back this with mTLS / a service mesh** so clients can't bypass the
  gateway and spoof tenant headers.
- Errors are normalized to a single envelope
  (`{ statusCode, message, error, path, method, timestamp, requestId }`); 500s
  never leak internals.
- Response hardening: `helmet`, configurable CORS, per-IP rate limiting,
  request-id propagation for distributed tracing.

## Testing

```bash
npm run lint     # 0 errors
npm run build    # tsc project references
npm run test     # 30 unit tests across 6 suites
npm run test:e2e # 11 e2e tests through the gateway (needs postgres + redis)
```

CI (`.github/workflows/ci.yml`) runs lint → build → unit → e2e on every push;
the last run is **green** and a **v0.1.0 release** is published.

## Production roadmap

- Replace the JWT header trust boundary with mTLS/service mesh.
- Persist the tenant directory in a cache with TTL + per-request fallback to the
  control plane.
- Add Kubernetes manifests and a secrets manager instead of env vars.
- Connect Prometheus to `/metrics` and ship logs using the propagated
  `x-request-id`.

---

Built with NestJS and TypeScript. See the repo
[on GitHub](https://github.com/prasant-0n/Multi-tenant-microservices-backend)
and the [v0.1.0 release](https://github.com/prasant-0n/Multi-tenant-microservices-backend/releases/tag/v0.1.0).
