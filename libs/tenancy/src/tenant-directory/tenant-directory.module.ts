import { Module } from '@nestjs/common';
import { TenantDirectory } from './tenant-directory.service';

@Module({
  providers: [TenantDirectory],
  exports: [TenantDirectory],
})
export class TenantDirectoryModule {}
