import { DataSource } from 'typeorm';
import { Tenant } from './tenants/tenant.entity';
import { loadEnvFile } from './env';

loadEnvFile();

export const tenantDataSource = new DataSource({
  type: 'postgres',
  url: process.env.POSTGRES_DSN ?? 'postgres://postgres:postgres@localhost:5433/multitenant',
  entities: [Tenant],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
});

export default tenantDataSource;
