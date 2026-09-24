import { tenantDataSource } from './data-source';

async function run(): Promise<void> {
  const dataSource = await tenantDataSource.initialize();
  try {
    await dataSource.undoLastMigration();
    // eslint-disable-next-line no-console
    console.log('Reverted the last migration');
  } finally {
    await dataSource.destroy();
  }
}

run().catch((err) => {
  console.error('Revert failed:', err);
  process.exit(1);
});
