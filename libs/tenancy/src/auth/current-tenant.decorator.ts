import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CurrentTenant } from './current-tenant';

export const TenantParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentTenant | undefined => {
    const request = ctx.switchToHttp().getRequest<{ tenant?: CurrentTenant }>();
    return request.tenant;
  },
);
