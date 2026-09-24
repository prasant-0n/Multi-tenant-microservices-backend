import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisEventsModule, TenantAuthModule } from '@app/tenancy';
import { Tenant } from './tenant.entity';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { SchemasService } from './schemas.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]),
    TenantAuthModule.register({
      secret: () => process.env.JWT_SECRET ?? 'dev-secret-change-me',
      issuer: 'multitenant-auth',
      audience: 'gateway',
    }),
    RedisEventsModule.register(),
  ],
  controllers: [TenantsController],
  providers: [TenantsService, SchemasService],
})
export class TenantsModule {}
