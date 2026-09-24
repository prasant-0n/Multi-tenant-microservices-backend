import { tenantDataSource } from './data-source';

async function run(): Promise<void> {
  const dataSource = await tenantDataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations();
    // eslint-disable-next-line no-console
    console.log(`Applied ${migrations.length} migration(s):`);
    for (const migration of migrations) {
      // eslint-disable-next-line no-console
      console.log(`  - ${migration.name}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', err);
  process.exit(1);
});
