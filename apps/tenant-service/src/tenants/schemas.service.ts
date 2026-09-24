import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'pg';

const DSN_DEFAULT = 'postgres://postgres:postgres@localhost:5433/multitenant';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Creates the dedicated Postgres schema for a new tenant. Table DDL inside
 * the schema is owned by each data-plane service (they reply to the
 * "tenant.created" event and create their own tables).
 */
@Injectable()
export class SchemasService {
  private readonly logger = new Logger(SchemasService.name);

  async provision(tenantId: string, schemaName: string): Promise<void> {
    const client = new Client({
      connectionString: process.env.POSTGRES_DSN ?? DSN_DEFAULT,
    });
    try {
      await client.connect();
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schemaName)}`);
      this.logger.log(`provisioned schema "${schemaName}" for tenant ${tenantId}`);
    } finally {
      await client.end();
    }
  }
}
