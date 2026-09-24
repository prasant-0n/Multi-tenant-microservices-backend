import { Module } from '@nestjs/common';
import {
  RedisEventsModule,
  TenantContextGuard,
  TenantDirectoryModule,
  TenantPoolModule,
} from '@app/tenancy';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TenantPoolModule, TenantDirectoryModule, RedisEventsModule.register()],
  controllers: [UsersController],
  providers: [UsersService, TenantContextGuard],
})
export class UsersModule {}
