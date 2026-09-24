import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { REDIS_EVENTS, RedisEventBus, TenantCreatedEvent } from '@app/tenancy';
import { Tenant } from './tenant.entity';
import { SchemasService } from './schemas.service';

export interface TenantListQuery {
  limit: number;
  offset: number;
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
    private readonly schemas: SchemasService,
    private readonly jwtService: JwtService,
    @Inject(REDIS_EVENTS)
    private readonly events: RedisEventBus,
  ) {}

  async create(name: string): Promise<Tenant> {
    const existing = await this.tenants.findOneBy({ name });
    if (existing) {
      throw new BadRequestException(`tenant "${name}" already exists`);
    }

    const schemaName = `tenant_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const tenant = this.tenants.create({ name, schemaName, status: 'active' });
    try {
      await this.tenants.save(tenant);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new BadRequestException(`tenant "${name}" already exists`);
      }
      throw err;
    }

    try {
      await this.schemas.provision(tenant.id, schemaName);
    } catch (err) {
      await this.tenants.remove(tenant).catch(() => undefined);
      throw new BadRequestException(`failed to provision schema: ${(err as Error).message}`);
    }

    const payload: TenantCreatedEvent = {
      tenantId: tenant.id,
      name: tenant.name,
      schema: tenant.schemaName,
    };
    await this.events.publish('tenant.created', payload);

    return tenant;
  }

  async findAll(query: TenantListQuery): Promise<Tenant[]> {
    const page = Math.max(1, query.limit);
    const offset = Math.max(0, query.offset);
    return this.tenants.find({
      order: { createdAt: 'ASC' },
      take: page,
      skip: offset,
    });
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findOneBy({ id });
    if (!tenant) {
      throw new NotFoundException(`tenant ${id} not found`);
    }
    return tenant;
  }

  async issueToken(id: string): Promise<{ accessToken: string }> {
    const tenant = await this.findOne(id);
    if (tenant.status !== 'active') {
      throw new ForbiddenException(`tenant ${id} is not active`);
    }
    const accessToken = await this.jwtService.signAsync({
      sub: tenant.id,
      schema: tenant.schemaName,
      name: tenant.name,
    });
    return { accessToken };
  }
}
