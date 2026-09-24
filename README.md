# Multi-tenant Backend (NestJS · Microservices · PostgreSQL schema-per-tenant)

A production-shaped `schema-per-tenant` microservice backend built with NestJS and
TypeScript. Every tenant gets its own PostgreSQL schema; services communicate
over **REST** and, asynchronously, over the **Redis** event bus.

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

# ops endpoints
curl -s $G/health      # aggregate health of gateway + services + redis
curl -s $G/metrics     # Prometheus-format request metrics
```

> A second tenant's token reads an **empty** user list — data is isolated per schema.

## Full-stack Docker Compose

Builds and runs everything (apps included):

```bash
docker compose up -d --build
```

- gateway on `http://localhost:3000`
- migrations run automatically before `tenant-service` starts
- shared secret for JWT signing: set `JWT_SECRET` in the environment or a root
  `.env` (copy `.env.example`).

## Environment variables

| Variable            | Apps                          | Default                    |
| ------------------- | ----------------------------- | -------------------------- |
| `PORT`              | all                           | 3000 / 3001 / 3002         |
| `POSTGRES_DSN`      | tenant, user                  | `postgres://postgres:postgres@localhost:5433/multitenant` |
| `REDIS_URL`         | gateway, tenant, user         | `redis://localhost:6380`   |
| `JWT_SECRET`        | gateway, tenant               | `dev-secret-change-me`     |
| `TENANT_SERVICE_URL`| gateway, user                 | `http://localhost:3001`    |
| `USER_SERVICE_URL`  | gateway                       | `http://localhost:3002`    |
| `RATE_LIMIT_TTL_MS` | gateway                       | `60000`                    |
| `RATE_LIMIT_MAX`    | gateway                       | `120`                      |
| `ENABLE_CORS`       | gateway                       | `false`                    |
| `CORS_ORIGINS`      | gateway                       | `*`                        |

Per-app `.env` files live in `apps/<name>/.env` (gitignored). `.env.example`
files document the same keys for each app.

## Security model

- All tenant-scoped routes require a JWT signed with the shared secret in
  `tenant-service` (`iss=multitenant-auth`, `aud=gateway`).
- The gateway verifies tokens, then forwards tenant context to services as
  `x-tenant-id` / `x-tenant-schema` headers.
- Data-plane services trust those headers via `TenantContextGuard`. **In
  production back this with mTLS or a service mesh** so clients can't bypass
  the gateway and spoof tenant headers.
- Errors are normalized to a single envelope
  (`{ statusCode, message, error, path, method, timestamp, requestId }`); 500s
  never leak internals.
- Response hardening: `helmet`, configurable CORS, per-IP rate limiting,
  request-id propagation for distributed tracing.

## Events (Redis pub/sub)

| Event           | Producer        | Consumers              |
| --------------- | --------------- | ---------------------- |
| `tenant.created`| tenant-service  | user-service (provisions schema), gateway (audit log) |
| `user.created`  | user-service    | gateway (audit log)    |

Subscribe with `RedisEventBus` (token `REDIS_EVENTS`) and publish with
`this.events.publish('event.name', payload)`.

## Testing

```bash
npm run lint
npm run build
npm test             # unit tests (5 suites)
npm run test:e2e     # end-to-end through the gateway (needs postgres+redis up)
```

CI (.github/workflows/ci.yml) runs lint, build, unit and e2e tests against
PostgreSQL + Redis service containers.

## Adding a new data-plane service

1. Scaffold `apps/<name>` by copying `apps/user-service` (config, `main.ts`
   with `createApp`, `.env`).
2. Import `TenancyModule`; inject `TenantPoolRegistry` for `search_path`-pinned
   pools and `TenantDirectory` for the tenant → schema map.
3. Guard routes with `TenantContextGuard`, read the tenant with `@TenantParam()`.
4. In `onModuleInit` (or in response to `tenant.created`), run idempotent DDL
   to create your tables inside each tenant schema.
5. Register the new app in `tsconfig.json` references and add it to
   `GatewayProxyService.services` + the CI workflow.

## Production roadmap

- Replace dev JWT/headers trust boundary with mTLS/service mesh (Istio/Linkerd).
- Persist the tenant directory / schema mapping in a cache with TTL and
  per-request fallback to the control plane.
- Add Kubernetes manifests and a secrets manager (Vault / K8s Secrets) instead
  of env vars.
- Connect Prometheus to `/metrics` and ship logs to a tracing backend using the
  propagated `x-request-id`.
- Make schema provisioning a transactional saga (registry + schema + events).