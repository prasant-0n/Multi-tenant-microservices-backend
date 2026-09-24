import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import path from 'node:path';
import { TenancyModule } from '@app/tenancy';
import { TenantsModule } from './tenants/tenants.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.join(__dirname, '..', '.env'),
        path.resolve(process.cwd(), 'apps/tenant-service/.env'),
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('POSTGRES_DSN'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    TenancyModule,
    TenantsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
