/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Aumente se precisar enviar payloads grandes (upload, etc.)
    bodyParser: true,
  });

  // Prefixo global
  app.setGlobalPrefix('api');

  // Pipes globais
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // --- CORS ---
  // Em produção, prefira setar origens explícitas via ENV (vírgula separadas).
  // Ex: CORS_ORIGINS="https://app.sua.com,https://admin.sua.com"
  const isProd = process.env.NODE_ENV === 'production';
  const rawOrigins = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean);
  app.enableCors({
    origin: isProd ? (rawOrigins?.length ? rawOrigins : false) : true, // em dev: true
    credentials: true,
  });

  // --- Cookies HttpOnly ---
  app.use(cookieParser());

  // --- trust proxy (para X-Forwarded-Proto / secure cookies atrás de proxy) ---
  // Só aplica se o adaptador for Express
  if (app.getHttpAdapter().getType() === 'express') {
    const instance = app.getHttpAdapter().getInstance();
    instance.set('trust proxy', 1);
  }

  // --- Swagger (somente fora de produção) ---
  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('Metas/Vendas API')
      .setDescription('API de monitoramento de vendas (Cliente → Loja → Funcionário)')
      .setVersion('1.0.0')
      .addBearerAuth() // Authorization: Bearer <token>
      // Permite testar cookies no Swagger (ex.: accessToken HttpOnly enviado pelo servidor)
      .addCookieAuth('accessToken', { type: 'apiKey', in: 'cookie' })
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Encerramento gracioso (útil em containers/orquestradores)
  app.enableShutdownHooks();

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);

  // Logs amigáveis
  const base = `http://localhost:${port}`;
  // Se estiver atrás de proxy com domínio, você pode imprimir a URL pública via ENV
  // ex.: PUBLIC_URL=https://api.sua.com
  const publicUrl = process.env.PUBLIC_URL ?? base;

  // eslint-disable-next-line no-console
  console.log(`🚀 API on ${publicUrl}`);
  if (!isProd) {
    // eslint-disable-next-line no-console
    console.log(`📚 Swagger on ${publicUrl}/docs`);
  }
}

bootstrap();
