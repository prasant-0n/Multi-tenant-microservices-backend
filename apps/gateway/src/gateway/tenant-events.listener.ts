import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { REDIS_EVENTS, RedisEventBus, TenantCreatedEvent, UserCreatedEvent } from '@app/tenancy';

@Injectable()
export class TenantEventsListener implements OnModuleInit {
  private readonly logger = new Logger(TenantEventsListener.name);

  constructor(@Inject(REDIS_EVENTS) private readonly events: RedisEventBus) {}

  onModuleInit(): void {
    this.events.subscribe<TenantCreatedEvent>('tenant.created', async (payload) => {
      this.logger.log(
        `[event] tenant.created tenantId=${payload.tenantId} schema=${payload.schema}`,
      );
    });
    this.events.subscribe<UserCreatedEvent>('user.created', async (payload) => {
      this.logger.log(`[event] user.created tenantId=${payload.tenantId} userId=${payload.userId}`);
    });
  }
}
