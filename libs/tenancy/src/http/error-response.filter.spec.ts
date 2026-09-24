import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './error-response.filter';

function makeHost(request: any, response: any): any {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('formats HttpExceptions with a consistent envelope', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const request = {
      path: '/api/tenants',
      method: 'POST',
      header: () => 'req-123',
    };

    const error = new BadRequestException('tenant already exists');
    filter.catch(error, makeHost(request, response));

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'tenant already exists',
        path: '/api/tenants',
        method: 'POST',
        requestId: 'req-123',
        timestamp: expect.any(String),
      }),
    );
  });

  it('joins array validation messages', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const request = { path: '/x', method: 'GET', header: () => undefined };

    const error = new NotFoundException(['a', 'b']);
    filter.catch(error, makeHost(request, response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'a, b' }));
  });

  it('converts unexpected errors into 500 without leaking internals', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const request = { path: '/x', method: 'GET', header: () => undefined };

    filter.catch(new Error('shhh database password=secret'), makeHost(request, response));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Internal server error',
        error: 'Internal Server Error',
      }),
    );
  });
});
