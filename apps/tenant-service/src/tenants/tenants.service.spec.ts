import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity';
import { TenantsService } from './tenants.service';
import { SchemasService } from './schemas.service';

describe('TenantsService', () => {
  let repo: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    find: jest.Mock;
  };
  let schemas: { provision: jest.Mock };
  let jwt: { signAsync: jest.Mock };
  let events: { publish: jest.Mock };
  let service: TenantsService;

  beforeEach(() => {
    repo = {
      findOneBy: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((tenant) => Promise.resolve(tenant)),
      update: jest.fn(),
      remove: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockResolvedValue([]),
    };
    schemas = { provision: jest.fn().mockResolvedValue(undefined) };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };
    events = { publish: jest.fn().mockResolvedValue(undefined) };

    service = new TenantsService(
      repo as unknown as Repository<Tenant>,
      schemas as unknown as SchemasService,
      jwt as unknown as JwtService,
      events as any,
    );
  });

  it('creates a tenant, provisions its schema and emits an event', async () => {
    repo.findOneBy.mockResolvedValue(null);

    const tenant = await service.create('Acme');

    expect(tenant.name).toBe('Acme');
    expect(tenant.status).toBe('active');
    expect(tenant.schemaName).toMatch(/^tenant_[a-f0-9]{12}$/);
    expect(schemas.provision).toHaveBeenCalledWith(tenant.id, tenant.schemaName);
    expect(events.publish).toHaveBeenCalledWith('tenant.created', {
      tenantId: tenant.id,
      name: 'Acme',
      schema: tenant.schemaName,
    });
  });

  it('rejects a duplicate tenant name', async () => {
    repo.findOneBy.mockResolvedValue({ id: 'x', name: 'Acme' });

    await expect(service.create('Acme')).rejects.toThrow(BadRequestException);
    expect(schemas.provision).not.toHaveBeenCalled();
  });

  it('rejects a duplicate name surfaced by a concurrent unique violation', async () => {
    repo.findOneBy.mockResolvedValue(null);
    repo.save.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));

    await expect(service.create('Acme')).rejects.toThrow(BadRequestException);
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('rolls back the registry row when schema provisioning fails', async () => {
    repo.findOneBy.mockResolvedValue(null);
    schemas.provision.mockRejectedValue(new Error('disk full'));

    await expect(service.create('Acme')).rejects.toThrow(BadRequestException);
    expect(repo.remove).toHaveBeenCalled();
  });

  it('clamps pagination bounds', async () => {
    await service.findAll({ limit: 0, offset: -5 });

    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 1, skip: 0 }));
  });

  it('throws when a tenant does not exist', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('issues a JWT carrying tenant claims', async () => {
    repo.findOneBy.mockResolvedValue({
      id: 't1',
      status: 'active',
      schemaName: 'tenant_x',
      name: 'Acme',
    });

    const { accessToken } = await service.issueToken('t1');

    expect(accessToken).toBe('signed-token');
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 't1',
      schema: 'tenant_x',
      name: 'Acme',
    });
  });

  it('refuses to issue a token for a disabled tenant', async () => {
    repo.findOneBy.mockResolvedValue({
      id: 't1',
      status: 'disabled',
      schemaName: 'tenant_x',
      name: 'Acme',
    });

    await expect(service.issueToken('t1')).rejects.toThrow(ForbiddenException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
