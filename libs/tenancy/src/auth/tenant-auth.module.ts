import { DynamicModule, Module } from '@nestjs/common';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { TenantAuthGuard } from './tenant-auth.guard';

export interface TenantAuthModuleOptions {
  secret: string | (() => string);
  expiresIn?: string;
  issuer?: string;
  audience?: string;
}

@Module({})
export class TenantAuthModule {
  static register(options: TenantAuthModuleOptions): DynamicModule {
    const verifyOptions = { issuer: options.issuer, audience: options.audience };

    return {
      module: TenantAuthModule,
      imports: [
        JwtModule.registerAsync({
          useFactory: () => ({
            secret: typeof options.secret === 'function' ? options.secret() : options.secret,
            signOptions: {
              expiresIn: options.expiresIn ?? '1h',
              issuer: options.issuer,
              audience: options.audience,
            },
          }),
        }),
      ],
      providers: [
        {
          provide: TenantAuthGuard,
          useFactory: (jwtService: JwtService) => new TenantAuthGuard(jwtService, verifyOptions),
          inject: [JwtService],
        },
      ],
      exports: [TenantAuthGuard, JwtModule],
    };
  }
}
