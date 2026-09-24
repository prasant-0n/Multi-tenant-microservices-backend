import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { TenantContextGuard } from './tenant-context.guard';
import { TENANT_HEADERS } from '../common/headers';

function createContext(headers: Record<string, string>) {
  const request = { headers, tenant: undefined };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as any;
  return { context, request };
}

describe('TenantContextGuard', () => {
  let guard: TenantContextGuard;

  beforeEach(() => {
    guard = new TenantContextGuard();
  });

  it('accepts valid tenant context headers', () => {
    const { context, request } = createContext({
      [TENANT_HEADERS.id]: '123e4567-e89b-12d3-a456-426614174000',
      [TENANT_HEADERS.schema]: 'tenant_abc123',
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(request.tenant).toEqual({
      tenantId: '123e4567-e89b-12d3-a456-426614174000',
      schema: 'tenant_abc123',
    });
  });

  it('rejects missing headers', () => {
    const { context } = createContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects partially present headers', () => {
    const { context } = createContext({ [TENANT_HEADERS.schema]: 'tenant_abc' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a schema crafted to inject connection options or SQL', () => {
    const { context } = createContext({
      [TENANT_HEADERS.id]: '123e4567-e89b-12d3-a456-426614174000',
      [TENANT_HEADERS.schema]: 'public; DROP TABLE users--',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a non-conforming tenant id', () => {
    const { context } = createContext({
      [TENANT_HEADERS.id]: '../../../../etc/passwd',
      [TENANT_HEADERS.schema]: 'tenant_abc',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
