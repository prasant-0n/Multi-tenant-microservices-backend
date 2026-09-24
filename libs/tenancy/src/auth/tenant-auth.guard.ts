import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CurrentTenant } from './current-tenant';

export interface TenantJwtPayload {
  sub: string;
  schema: string;
  name?: string;
}

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly verifyOptions: { issuer?: string; audience?: string } = {},
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string }; tenant?: CurrentTenant }>();

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = this.jwtService.verify<TenantJwtPayload>(authorization.slice(7), {
        ...this.verifyOptions,
      });
      if (!payload.sub || !payload.schema) {
        throw new UnauthorizedException('Token is missing tenant claims');
      }
      request.tenant = {
        tenantId: payload.sub,
        schema: payload.schema,
        name: payload.name,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
