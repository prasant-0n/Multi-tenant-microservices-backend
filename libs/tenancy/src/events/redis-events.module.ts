import { DynamicModule, Module } from '@nestjs/common';
import { REDIS_EVENTS } from './events.tokens';
import { RedisEventBus } from './redis-event-bus';

@Module({})
export class RedisEventsModule {
  static register(): DynamicModule {
    return {
      module: RedisEventsModule,
      global: true,
      providers: [{ provide: REDIS_EVENTS, useClass: RedisEventBus }],
      exports: [REDIS_EVENTS],
    };
  }
}
