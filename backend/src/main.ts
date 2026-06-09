import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefixo global /api (Doc 2, secao 5 — todas as rotas sob /api).
  app.setGlobalPrefix('api');

  // Validacao automatica de DTOs (entra em uso a partir do Dia 3 — Auth).
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // CORS liberado em dev; restringe ao dominio da KingHost via env em prod.
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? true });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Private Studio backend rodando em http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap();
