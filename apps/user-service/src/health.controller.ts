import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  async check(): Promise<{ status: string; database: string }> {
    let database = 'down';
    const client = new Client({
      connectionString: this.config.get<string>(
        'POSTGRES_DSN',
        'postgres://postgres:postgres@localhost:5433/multitenant',
      ),
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
      database = 'up';
    } catch {
      /* db down */
    } finally {
      await client.end().catch(() => undefined);
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
    };
  }
}
