import { config as loadDotEnv } from 'dotenv';
import path from 'node:path';

const CANDIDATES = [
  path.join(__dirname, '..', '.env'),
  path.resolve(process.cwd(), 'apps/tenant-service/.env'),
];

/** Loads the tenant-service .env into process.env (idempotent-ish). */
export function loadEnvFile(): void {
  for (const file of CANDIDATES) {
    loadDotEnv({ path: file });
  }
}
