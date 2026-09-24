import { Module } from '@nestjs/common';
import { TenantDirectoryModule } from './tenant-directory/tenant-directory.module';
import { TenantPoolModule } from './pool/tenant-pool.module';
import { RedisEventsModule } from './events/redis-events.module';

@Module({
  imports: [TenantPoolModule, TenantDirectoryModule, RedisEventsModule.register()],
  exports: [TenantPoolModule, TenantDirectoryModule, RedisEventsModule],
})
export class TenancyModule {}
