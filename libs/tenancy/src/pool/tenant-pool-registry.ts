import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

const DSN_DEFAULT = 'postgres://postgres:postgres@localhost:5433/multitenant';
const SCHEMA_PATTERN = /^[a-z0-9_]+$/i;

@Injectable()
export class TenantPoolRegistry implements OnModuleDestroy {
  private readonly logger = new Logger(TenantPoolRegistry.name);
  private readonly pools = new Map<string, Pool>();

  /**
   * Returns a cached connection pool whose search_path is pinned to the
   * tenant schema. Every query on this pool runs against that tenant's schema.
   */
  getPool(schema: string): Pool {
    if (!SCHEMA_PATTERN.test(schema)) {
      throw new Error(`cannot open pool for invalid schema name "${schema}"`);
    }
    let pool = this.pools.get(schema);
    if (!pool) {
      pool = new Pool({
        connectionString: process.env.POSTGRES_DSN ?? DSN_DEFAULT,
        max: 5,
        options: `-c search_path=${schema}`,
      });
      pool.on('error', (err) =>
        this.logger.error(`idle client error for schema "${schema}": ${err.message}`),
      );
      this.pools.set(schema, pool);
    }
    return pool;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.pools.values()].map((pool) => pool.end()));
  }
}
