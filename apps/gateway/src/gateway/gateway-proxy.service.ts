import { BadGatewayException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request as Req, Response as Res } from 'express';
import {
  REDIS_EVENTS,
  REQUEST_ID_HEADER,
  RedisEventBus,
  TENANT_HEADERS,
  type TenantJwtPayload,
} from '@app/tenancy';
import { MetricsService } from './metrics.service';

interface ServiceRoute {
  name: string;
  prefix: string;
  url: string;
}

interface HealthCheckReport {
  name: string;
  status: 'ok' | 'degraded' | 'down';
}

const PUBLIC_ROUTES: Array<{ method: string; path: RegExp }> = [
  { method: 'POST', path: /^\/tenants$/ },
  { method: 'POST', path: /^\/tenants\/[^/]+\/token$/ },
];

const UPSTREAM_TIMEOUT_MS = 15_000;

@Injectable()
export class GatewayProxyService {
  private readonly services: ServiceRoute[];

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
    @Inject(REDIS_EVENTS)
    private readonly events: RedisEventBus,
  ) {
    this.services = [
      {
        name: 'tenant-service',
        prefix: '/tenants',
        url: config.get<string>('TENANT_SERVICE_URL', 'http://localhost:3001'),
      },
      {
        name: 'user-service',
        prefix: '/users',
        url: config.get<string>('USER_SERVICE_URL', 'http://localhost:3002'),
      },
    ];
  }

  async forward(req: Req, res: Res): Promise<void> {
    const pathname = req.path.replace(/^\/api/, '');

    if (pathname === '/health') {
      return this.health(res);
    }
    if (pathname === '/metrics') {
      res
        .status(200)
        .set('content-type', 'text/plain; version=0.0.4; charset=utf-8')
        .send(this.metrics.render());
      return;
    }

    const service = this.services.find(
      (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
    );
    if (!service) {
      res.status(404).json({
        statusCode: 404,
        error: 'Not Found',
        message: `no service registered for ${req.method} ${pathname}`,
      });
      return;
    }

    const tenant = this.isPublic(req.method, pathname) ? undefined : this.verifyRequest(req);

    const target = new URL(
      req.originalUrl.replace(/^\/api/, ''),
      service.url.endsWith('/') ? service.url : `${service.url}/`,
    );

    const headers: Record<string, string> = {
      [REQUEST_ID_HEADER]: req.header(REQUEST_ID_HEADER) ?? 'unknown',
    };
    const contentType = req.get('content-type');
    const accept = req.get('accept');
    if (contentType) headers['content-type'] = contentType;
    if (accept) headers['accept'] = accept;
    if (tenant) {
      headers[TENANT_HEADERS.id] = tenant.sub;
      headers[TENANT_HEADERS.schema] = tenant.schema;
      if (tenant.name) headers[TENANT_HEADERS.name] = tenant.name;
    }

    const init: RequestInit = {
      method: req.method,
      headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    };

    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.body && typeof req.body === 'object') {
        headers['content-type'] = contentType ?? 'application/json';
        const body = JSON.stringify(req.body);
        headers['content-length'] = String(Buffer.byteLength(body));
        init.body = body;
      } else if (req.body) {
        init.body = req.body;
      }
    }

    let upstream: Response;
    try {
      upstream = await fetch(target, init);
    } catch (err) {
      throw new BadGatewayException(
        `upstream ${service.prefix} unreachable: ${(err as Error).message}`,
      );
    }

    const text = await upstream.text();
    res
      .status(upstream.status)
      .set('content-type', upstream.headers.get('content-type') ?? 'application/json')
      .send(text);
  }

  private isPublic(method: string, pathname: string): boolean {
    return PUBLIC_ROUTES.some((route) => route.method === method && route.path.test(pathname));
  }

  private verifyRequest(req: Req): TenantJwtPayload {
    const authorization = req.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      return this.jwtService.verify<TenantJwtPayload>(authorization.slice(7), {
        issuer: 'multitenant-auth',
        audience: 'gateway',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async health(res: Res): Promise<void> {
    const checks: HealthCheckReport[] = [{ name: 'gateway', status: 'ok' }];

    for (const service of this.services) {
      const name = service.name;
      try {
        const response = await fetch(`${service.url}/health`, {
          signal: AbortSignal.timeout(2_000),
        });
        checks.push({ name, status: response.ok ? 'ok' : 'degraded' });
      } catch {
        checks.push({ name, status: 'down' });
      }
    }

    const redisUp = await this.events.ping();
    checks.push({ name: 'redis', status: redisUp ? 'ok' : 'down' });

    const allOk = checks.every((check) => check.status === 'ok');
    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      dependencies: checks,
      timestamp: new Date().toISOString(),
    });
  }
}
