import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import path from 'node:path';
import { TenancyModule } from '@app/tenancy';
import { UsersModule } from './users/users.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.join(__dirname, '..', '.env'),
        path.resolve(process.cwd(), 'apps/user-service/.env'),
      ],
    }),
    TenancyModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
