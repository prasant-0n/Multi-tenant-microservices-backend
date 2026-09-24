import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import path from 'node:path';
import { RedisEventsModule, TenantAuthModule } from '@app/tenancy';
import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.join(__dirname, '..', '.env'),
        path.resolve(process.cwd(), 'apps/gateway/.env'),
      ],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('RATE_LIMIT_TTL_MS', 60_000),
          limit: config.get<number>('RATE_LIMIT_MAX', 120),
        },
      ],
    }),
    TenantAuthModule.register({
      secret: () => process.env.JWT_SECRET ?? 'dev-secret-change-me',
      issuer: 'multitenant-auth',
      audience: 'gateway',
    }),
    RedisEventsModule.register(),
    GatewayModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
