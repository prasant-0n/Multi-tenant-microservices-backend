import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { tenantDataSource } from '../apps/tenant-service/src/data-source';
import { createApp as createGateway } from '../apps/gateway/src/main';
import { createApp as createTenantApp } from '../apps/tenant-service/src/main';
import { createApp as createUserApp } from '../apps/user-service/src/main';

async function runMigrations(): Promise<void> {
  const dataSource = await tenantDataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}

async function listenAndGetPort(app: INestApplication): Promise<number> {
  await app.listen(0);
  const address = app.getHttpServer().address();
  return (address as { port: number }).port;
}

async function waitFor(
  predicate: () => Promise<boolean>,
  attempts = 40,
  intervalMs = 250,
): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('condition not met in time');
}

describe('Multi-tenant backend (e2e)', () => {
  let tenantApp: INestApplication;
  let userApp: INestApplication;
  let gatewayApp: INestApplication;

  const tenantA = { name: `Acme-${Date.now()}` };
  const tenantB = { name: `Globex-${Date.now()}` };
  let tenantAId: string;
  let tenantBId: string;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    await runMigrations();

    tenantApp = await createTenantApp();
    const tenantPort = await listenAndGetPort(tenantApp);
    process.env.TENANT_SERVICE_URL = `http://127.0.0.1:${tenantPort}`;

    userApp = await createUserApp();
    const userPort = await listenAndGetPort(userApp);
    process.env.USER_SERVICE_URL = `http://127.0.0.1:${userPort}`;

    gatewayApp = await createGateway();
    await listenAndGetPort(gatewayApp);
  });

  afterAll(async () => {
    await gatewayApp?.close();
    await userApp?.close();
    await tenantApp?.close();
  });

  it('reports aggregate health', async () => {
    const res = await request(gatewayApp.getHttpServer()).get('/api/health').expect(200);

    expect(res.body.status).toBe('ok');
    const names = res.body.dependencies.map((d: { name: string }) => d.name);
    expect(names).toEqual(
      expect.arrayContaining(['gateway', 'tenant-service', 'user-service', 'redis']),
    );
  });

  it('creates tenants (public route)', async () => {
    const first = await request(gatewayApp.getHttpServer())
      .post('/api/tenants')
      .send(tenantA)
      .expect(201);

    tenantAId = first.body.id;
    expect(first.body.schemaName).toMatch(/^tenant_/);
    expect(first.body.status).toBe('active');

    const second = await request(gatewayApp.getHttpServer())
      .post('/api/tenants')
      .send(tenantB)
      .expect(201);
    tenantBId = second.body.id;
  });

  it('rejects duplicate tenant names', async () => {
    await request(gatewayApp.getHttpServer()).post('/api/tenants').send(tenantA).expect(400);
  });

  it('rejects requests without a token', async () => {
    await request(gatewayApp.getHttpServer()).get('/api/users').expect(401);
  });

  it('rejects requests with an invalid token', async () => {
    await request(gatewayApp.getHttpServer())
      .get('/api/users')
      .set('authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('issues tenant-scoped tokens', async () => {
    tokenA = (
      await request(gatewayApp.getHttpServer()).post(`/api/tenants/${tenantAId}/token`).expect(200)
    ).body.accessToken;
    tokenB = (
      await request(gatewayApp.getHttpServer()).post(`/api/tenants/${tenantBId}/token`).expect(200)
    ).body.accessToken;

    expect(tokenA).toBeTruthy();
    expect(tokenB).toBeTruthy();
  });

  it('provisions the users table in each tenant schema', async () => {
    await waitFor(async () => {
      const res = await request(gatewayApp.getHttpServer())
        .get('/api/users')
        .set('authorization', `Bearer ${tokenA}`);
      return res.status === 200 && Array.isArray(res.body);
    });
    await waitFor(async () => {
      const res = await request(gatewayApp.getHttpServer())
        .get('/api/users')
        .set('authorization', `Bearer ${tokenB}`);
      return res.status === 200 && Array.isArray(res.body);
    });
  });

  it('is isolated: users created in tenant A are invisible to tenant B', async () => {
    const created = await request(gatewayApp.getHttpServer())
      .post('/api/users')
      .set('authorization', `Bearer ${tokenA}`)
      .send({ name: 'Ada Lovelace', email: 'ada@acme.io' })
      .expect(201);

    expect(created.body).toEqual(
      expect.objectContaining({ name: 'Ada Lovelace', email: 'ada@acme.io' }),
    );

    const usersA = await request(gatewayApp.getHttpServer())
      .get('/api/users')
      .set('authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(usersA.body).toHaveLength(1);
    expect(usersA.body[0].email).toBe('ada@acme.io');

    const usersB = await request(gatewayApp.getHttpServer())
      .get('/api/users')
      .set('authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(usersB.body).toHaveLength(0);

    const userA = await request(gatewayApp.getHttpServer())
      .get(`/api/users/${created.body.id}`)
      .set('authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(userA.body.id).toBe(created.body.id);

    await request(gatewayApp.getHttpServer())
      .get(`/api/users/${created.body.id}`)
      .set('authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('enforces validation on create', async () => {
    await request(gatewayApp.getHttpServer())
      .post('/api/users')
      .set('authorization', `Bearer ${tokenA}`)
      .send({ name: '', email: 'not-an-email' })
      .expect(400);
  });

  it('exposes gateway metrics', async () => {
    await request(gatewayApp.getHttpServer()).get('/api/health').expect(200);

    await waitFor(async () => {
      const res = await request(gatewayApp.getHttpServer()).get('/api/metrics').expect(200);
      return res.text.includes('gateway_requests_total');
    });
  });

  it('404s unknown service paths', async () => {
    await request(gatewayApp.getHttpServer()).get('/api/unknown').expect(404);
  });
});
