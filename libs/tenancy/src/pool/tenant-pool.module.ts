import { Module } from '@nestjs/common';
import { TenantPoolRegistry } from './tenant-pool-registry';

@Module({
  providers: [TenantPoolRegistry],
  exports: [TenantPoolRegistry],
})
export class TenantPoolModule {}
