import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_EVENTS } from '../events/events.tokens';
import { RedisEventBus } from '../events/redis-event-bus';
import { TenantCreatedEvent } from '../events/events.tokens';

export interface TenantDirectoryEntry {
  tenantId: string;
  schema: string;
}

/**
 * In-memory tenantId -> schema registry for data-plane services.
 * Hydrated lazily from the control-plane (POST /tenants) and kept fresh by
 * subscribing to the "tenant.created" event bus.
 */
@Injectable()
export class TenantDirectory {
  private readonly logger = new Logger(TenantDirectory.name);
  private readonly entries = new Map<string, string>();

  constructor(
    @Inject(REDIS_EVENTS)
    private readonly events: RedisEventBus,
  ) {}

  /** Fetch the full tenant list from the control-plane and index schema names. */
  async sync(controlPlaneUrl: string): Promise<void> {
    const pageSize = 500;
    const next = new Map<string, string>();
    try {
      let offset = 0;
      for (;;) {
        const response = await fetch(
          `${controlPlaneUrl}/tenants?limit=${pageSize}&offset=${offset}`,
          { signal: AbortSignal.timeout(5_000) },
        );
        if (!response.ok) {
          this.logger.warn(`tenant sync failed: GET /tenants -> ${response.status}`);
          return;
        }
        const tenants = (await response.json()) as Array<{
          id: string;
          schemaName: string;
        }>;
        if (!Array.isArray(tenants)) {
          this.logger.warn(`tenant sync failed: unexpected response shape`);
          return;
        }
        for (const tenant of tenants) {
          next.set(tenant.id, tenant.schemaName);
        }
        if (tenants.length < pageSize) break;
        offset += pageSize;
      }
    } catch (err) {
      this.logger.warn(
        `tenant directory sync failed: ${(err as Error).message} (will rely on events)`,
      );
      return;
    }

    this.entries.clear();
    for (const [tenantId, schema] of next) {
      this.entries.set(tenantId, schema);
    }
    this.logger.log(`tenant directory synced: ${this.entries.size} tenant(s) known`);
  }

  /** Register live events keeping the directory fresh. */
  listen(): void {
    this.events.subscribe<TenantCreatedEvent>('tenant.created', (payload) => {
      this.entries.set(payload.tenantId, payload.schema);
      this.logger.log(
        `tenant directory learned tenantId=${payload.tenantId} schema=${payload.schema}`,
      );
    });
  }

  schemaOf(tenantId: string): string | undefined {
    return this.entries.get(tenantId);
  }

  all(): TenantDirectoryEntry[] {
    return [...this.entries.entries()].map(([tenantId, schema]) => ({
      tenantId,
      schema,
    }));
  }
}
