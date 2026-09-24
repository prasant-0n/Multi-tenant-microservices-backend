import { Injectable } from '@nestjs/common';

interface RouteStats {
  requests: number;
  errors: number;
}

const sanitizeRoute = (path: string): string => {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  return (
    '/' +
    parts
      .map((part) =>
        part === 'api' ? part : /^[0-9a-f-]{36}$/i.test(part) || /^\d+$/.test(part) ? ':id' : part,
      )
      .join('/')
  );
};

/**
 * Minimal Prometheus-compatible metrics for gateway traffic.
 * Expand by pointing a real Prometheus at /metrics if needed.
 */
@Injectable()
export class MetricsService {
  private readonly routes = new Map<string, RouteStats>();
  private durationCount = 0;
  private durationSumMs = 0;

  record(method: string, path: string, status: number, durationMs: number): void {
    const key = `${method} ${sanitizeRoute(path)}`;
    const stats = this.routes.get(key) ?? { requests: 0, errors: 0 };
    stats.requests += 1;
    if (status >= 500) stats.errors += 1;
    this.routes.set(key, stats);

    this.durationCount += 1;
    this.durationSumMs += durationMs;
  }

  render(): string {
    const lines: string[] = [];
    lines.push('# HELP gateway_requests_total Total requests handled by route');
    lines.push('# TYPE gateway_requests_total counter');
    for (const [route, stats] of this.routes.entries()) {
      const [method, path] = route.split(' ');
      lines.push(`gateway_requests_total{method="${method}",path="${path}"} ${stats.requests}`);
    }
    lines.push('# HELP gateway_request_errors_total Total 5xx responses by route');
    lines.push('# TYPE gateway_request_errors_total counter');
    for (const [route, stats] of this.routes.entries()) {
      const [method, path] = route.split(' ');
      lines.push(`gateway_request_errors_total{method="${method}",path="${path}"} ${stats.errors}`);
    }
    lines.push('# HELP gateway_request_duration_seconds Summary of request durations');
    lines.push('# TYPE gateway_request_duration_seconds summary');
    lines.push(`gateway_request_duration_seconds_count ${this.durationCount}`);
    lines.push(`gateway_request_duration_seconds_sum ${(this.durationSumMs / 1000).toFixed(6)}`);
    return lines.join('\n') + '\n';
  }
}
