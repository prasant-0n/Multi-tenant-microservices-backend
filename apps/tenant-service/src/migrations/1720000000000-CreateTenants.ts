import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenants1720000000000 implements MigrationInterface {
  name = 'CreateTenants1720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenants" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'active',
        "schemaName" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenants_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenants_name" UNIQUE ("name"),
        CONSTRAINT "UQ_tenants_schemaName" UNIQUE ("schemaName")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
  }
}
