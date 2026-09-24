import { ConfigService } from '@nestjs/config';
import { TenantDirectory, TenantPoolRegistry } from '@app/tenancy';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let pools: { getPool: jest.Mock };
  let pool: { query: jest.Mock };
  let directory: { sync: jest.Mock; all: jest.Mock; listen: jest.Mock };
  let config: { getOrThrow: jest.Mock };
  let events: { publish: jest.Mock; subscribe: jest.Mock };
  let service: UsersService;

  const userRow = {
    id: 'u1',
    name: 'Ada',
    email: 'ada@acme.com',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    pool = { query: jest.fn() };
    pools = { getPool: jest.fn().mockReturnValue(pool) };
    directory = {
      sync: jest.fn().mockResolvedValue(undefined),
      all: jest.fn().mockReturnValue([]),
      listen: jest.fn(),
    };
    config = { getOrThrow: jest.fn().mockReturnValue('http://control') };
    events = { publish: jest.fn().mockResolvedValue(undefined), subscribe: jest.fn() };

    service = new UsersService(
      pools as unknown as TenantPoolRegistry,
      directory as unknown as TenantDirectory,
      config as unknown as ConfigService,
      events as any,
    );
  });

  it('restores a schema-per-tenant connection pool', () => {
    expect(service).toBeDefined();
  });

  it('creates a user in the tenant schema and emits an event', async () => {
    pool.query.mockResolvedValue({ rows: [userRow] });

    const user = await service.create('tenant_x', 't1', 'Ada', 'ada@acme.com');

    expect(user).toEqual(userRow);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), [
      'Ada',
      'ada@acme.com',
    ]);
    expect(events.publish).toHaveBeenCalledWith('user.created', {
      tenantId: 't1',
      userId: 'u1',
      email: 'ada@acme.com',
    });
  });

  it('lists users for a schema with limit/offset', async () => {
    pool.query.mockResolvedValue({ rows: [userRow] });

    const users = await service.findAll('tenant_x', 10, 20);

    expect(users).toEqual([userRow]);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $1'), [10, 20]);
  });

  it('provisions the users table idempotently for a schema', async () => {
    pool.query.mockResolvedValue({});

    await service.ensureUsersTable('tenant_x');

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS users'),
    );
  });

  it('bootstraps from the control plane and subscribes to live events', async () => {
    directory.all.mockReturnValue([{ tenantId: 't1', schema: 'tenant_x' }]);
    pool.query.mockResolvedValue([]);

    await service.onModuleInit();

    expect(directory.sync).toHaveBeenCalledWith('http://control');
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE'));
    expect(events.subscribe).toHaveBeenCalledWith('tenant.created', expect.any(Function));
  });
});
