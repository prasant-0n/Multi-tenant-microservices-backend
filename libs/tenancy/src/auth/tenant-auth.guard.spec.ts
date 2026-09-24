import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantAuthGuard, type TenantJwtPayload } from './tenant-auth.guard';

interface MockRequest {
  headers: { authorization?: string };
  tenant?: { tenantId: string; schema: string };
}

function makeContext(request: MockRequest): any {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

describe('TenantAuthGuard', () => {
  let jwt: { verify: jest.Mock };
  let guard: TenantAuthGuard;

  const payload: TenantJwtPayload = {
    sub: 'tenant-1',
    schema: 'tenant_abc',
    name: 'Acme',
  };

  beforeEach(() => {
    jwt = { verify: jest.fn() };
    guard = new TenantAuthGuard(jwt as unknown as JwtService, {
      issuer: 'multitenant-auth',
      audience: 'gateway',
    });
  });

  it('rejects requests without a bearer token', () => {
    const request: MockRequest = { headers: {} };
    expect(() => guard.canActivate(makeContext(request))).toThrow(UnauthorizedException);
  });

  it('rejects an invalid/expired token', () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('expired');
    });
    const request: MockRequest = { headers: { authorization: 'Bearer nope' } };
    expect(() => guard.canActivate(makeContext(request))).toThrow(UnauthorizedException);
  });

  it('rejects a token missing tenant claims', () => {
    jwt.verify.mockReturnValue({ sub: 'tenant-1' });
    const request: MockRequest = { headers: { authorization: 'Bearer tok' } };
    expect(() => guard.canActivate(makeContext(request))).toThrow(UnauthorizedException);
  });

  it('resolves the current tenant from a valid token', () => {
    jwt.verify.mockReturnValue(payload);
    const request: MockRequest = { headers: { authorization: 'Bearer tok' } };

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(request.tenant).toEqual({
      tenantId: 'tenant-1',
      schema: 'tenant_abc',
      name: 'Acme',
    });
    expect(jwt.verify).toHaveBeenCalledWith('tok', {
      issuer: 'multitenant-auth',
      audience: 'gateway',
    });
  });
});
