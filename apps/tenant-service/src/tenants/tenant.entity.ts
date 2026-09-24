import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type TenantStatus = 'active' | 'disabled';

/**
 * Tenant registry. Lives in the shared "public" schema and maps every
 * tenant to a dedicated Postgres schema holding that tenant's data.
 */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'varchar', default: 'active' })
  status: TenantStatus;

  @Column()
  schemaName: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
