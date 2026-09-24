import { All, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { GatewayProxyService } from './gateway-proxy.service';

@Controller()
export class GatewayController {
  constructor(private readonly proxy: GatewayProxyService) {}

  @All('*')
  async route(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.proxy.forward(req, res);
  }
}
