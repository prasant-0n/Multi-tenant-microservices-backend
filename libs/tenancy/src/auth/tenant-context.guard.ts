import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentTenant } from './current-tenant';
import { TENANT_HEADERS } from '../common/headers';

const SCHEMA_PATTERN = /^[a-z0-9_]+$/i;
const TENANT_ID_PATTERN = /^[0-9a-zA-Z-]{1,64}$/;

/**
 * For data-plane services reached behind the gateway. Trusts the tenant
 * context headers injected by the gateway (JWT claims -> headers).
 * Header values are strictly validated so a spoofed header can never
 * influence SQL identifiers or connection options (search_path).
 * In production, back it up with mTLS / a service mesh so clients cannot
 * spoof the headers directly.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; tenant?: CurrentTenant }>();

    const tenantId = request.headers[TENANT_HEADERS.id];
    const schema = request.headers[TENANT_HEADERS.schema];

    if (!tenantId && !schema) {
      throw new UnauthorizedException('Missing tenant context headers');
    }
    if (!tenantId || !schema) {
      throw new ForbiddenException('Inconsistent tenant context headers');
    }
    if (!TENANT_ID_PATTERN.test(tenantId) || !SCHEMA_PATTERN.test(schema)) {
      throw new ForbiddenException('Invalid tenant context headers');
    }

    request.tenant = { tenantId, schema };
    return true;
  }
}
