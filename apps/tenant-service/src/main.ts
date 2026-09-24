import { NestFactory } from '@nestjs/core';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from '@app/tenancy';
import { AppModule } from './app.module';

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'error', 'warn'] });
  configureApp(app);
  return app;
}

const BOOTSTRAP_CONTEXT = 'tenant-service';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`tenant-service listening on http://localhost:${port}`, BOOTSTRAP_CONTEXT);
}

if (require.main === module) {
  void bootstrap();
}
