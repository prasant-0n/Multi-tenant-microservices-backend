import { NestFactory } from '@nestjs/core';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AllExceptionsFilter } from '@app/tenancy';
import { AppModule } from './app.module';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(helmet());

  const corsEnabled = process.env.ENABLE_CORS === 'true';
  if (corsEnabled) {
    const origins = (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim());
    app.enableCors({
      origin: origins.includes('*') ? true : origins,
      credentials: origins.includes('*') ? false : true,
    });
  } else {
    app.enableCors({ origin: false });
  }

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });
  configureApp(app);
  return app;
}

const BOOTSTRAP_CONTEXT = 'gateway';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`gateway listening on http://localhost:${port}/api`, BOOTSTRAP_CONTEXT);
}

if (require.main === module) {
  void bootstrap();
}
