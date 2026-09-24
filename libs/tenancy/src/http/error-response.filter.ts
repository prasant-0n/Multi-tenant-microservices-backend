import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

function statusName(status: number): string {
  const key = HttpStatus[status] as string | undefined;
  if (!key) return 'Error';
  return key
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  path: string;
  method: string;
  timestamp: string;
  requestId?: string;
}

/**
 * Global exception filter producing a consistent error envelope across all
 * services. Client errors are forwarded as-is; server errors are logged and
 * never leak internal details.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Internal server error';
    if (isHttp) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (
        body &&
        typeof body === 'object' &&
        'message' in body &&
        (Array.isArray((body as { message: unknown }).message) ||
          typeof (body as { message: unknown }).message === 'string')
      ) {
        const raw = (body as { message: string | string[] }).message;
        message = Array.isArray(raw) ? raw.join(', ') : raw;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.stack ?? exception.message);
    }

    const payload: ErrorResponse = {
      statusCode: status,
      message,
      error: statusName(status),
      path: request.path,
      method: request.method,
      timestamp: new Date().toISOString(),
      requestId: request.header(REQUEST_ID_HEADER),
    };

    response.status(status).json(payload);
  }
}
