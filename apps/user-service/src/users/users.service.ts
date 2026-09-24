import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RedisEventBus,
  REDIS_EVENTS,
  TenantDirectory,
  TenantPoolRegistry,
  TenantCreatedEvent,
  UserCreatedEvent,
} from '@app/tenancy';

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private readonly provisionedSchemas = new Set<string>();
  private readonly provisioning = new Map<string, Promise<void>>();

  constructor(
    private readonly pools: TenantPoolRegistry,
    private readonly directory: TenantDirectory,
    private readonly config: ConfigService,
    @Inject(REDIS_EVENTS)
    private readonly events: RedisEventBus,
  ) {}

  async onModuleInit(): Promise<void> {
    const controlPlane = this.config.getOrThrow<string>('TENANT_SERVICE_URL');
    await this.directory.sync(controlPlane);

    for (const entry of this.directory.all()) {
      await this.ensureUsersTable(entry.schema).catch((err) =>
        this.logger.error(`provision failed for ${entry.tenantId}: ${err.message}`),
      );
    }

    this.directory.listen();
    this.events.subscribe<TenantCreatedEvent>('tenant.created', async (payload) => {
      await this.ensureUsersTable(payload.schema);
    });
  }

  /**
   * Idempotently creates the users table inside one tenant schema. Self-heals
   * schemas provisioned by a missed event or a failed boot by running as part
   * of each operation (cheap after the first call thanks to a per-schema flag).
   */
  async ensureUsersTable(schema: string): Promise<void> {
    if (this.provisionedSchemas.has(schema)) return;

    const pending = this.provisioning.get(schema);
    if (pending) return pending;

    const run = (async () => {
      const pool = this.pools.getPool(schema);
      await pool.query(`CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        email text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
      this.provisionedSchemas.add(schema);
      this.logger.log(`users table ready in schema "${schema}"`);
    })();

    this.provisioning.set(schema, run);
    try {
      return await run;
    } finally {
      this.provisioning.delete(schema);
    }
  }

  async create(schema: string, tenantId: string, name: string, email: string): Promise<User> {
    await this.ensureUsersTable(schema);
    const pool = this.pools.getPool(schema);
    const { rows } = await pool.query<User>(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email, "createdAt"',
      [name, email],
    );
    const user = rows[0];

    const payload: UserCreatedEvent = {
      tenantId,
      userId: user.id,
      email: user.email,
    };
    await this.events.publish('user.created', payload);
    return user;
  }

  async findAll(schema: string, limit: number, offset: number): Promise<User[]> {
    await this.ensureUsersTable(schema);
    const pool = this.pools.getPool(schema);
    const { rows } = await pool.query<User>(
      'SELECT id, name, email, "createdAt" FROM users ORDER BY "createdAt" ASC LIMIT $1 OFFSET $2',
      [limit, offset],
    );
    return rows;
  }

  async findById(schema: string, id: string): Promise<User | null> {
    await this.ensureUsersTable(schema);
    const pool = this.pools.getPool(schema);
    const { rows } = await pool.query<User>(
      'SELECT id, name, email, "createdAt" FROM users WHERE id = $1 LIMIT 1',
      [id],
    );
    return rows[0] ?? null;
  }

  async remove(schema: string, id: string): Promise<boolean> {
    await this.ensureUsersTable(schema);
    const pool = this.pools.getPool(schema);
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}
