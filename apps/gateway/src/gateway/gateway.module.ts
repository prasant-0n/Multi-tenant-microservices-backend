import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TenantAuthModule } from '@app/tenancy';
import { GatewayController } from './gateway.controller';
import { GatewayProxyService } from './gateway-proxy.service';
import { MetricsService } from './metrics.service';
import { RequestContextMiddleware } from './request-context.middleware';
import { TenantEventsListener } from './tenant-events.listener';

@Module({
  imports: [
    TenantAuthModule.register({
      secret: () => process.env.JWT_SECRET ?? 'dev-secret-change-me',
      issuer: 'multitenant-auth',
      audience: 'gateway',
    }),
  ],
  controllers: [GatewayController],
  providers: [GatewayProxyService, MetricsService, TenantEventsListener],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
