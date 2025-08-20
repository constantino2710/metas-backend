/* eslint-disable prettier/prettier */
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
// opcional, se quiser desligar o app junto com o prisma
// import { PrismaService } from './database/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // prefixo global (bom p/ versionar e organizar rotas)
  app.setGlobalPrefix('api');

  // validação global dos DTOs (class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,             // remove campos extras
      forbidNonWhitelisted: false, // true se quiser 400 em campos extras
      transform: true,             // transforma tipos (string->number, etc)
    }),
  );

  // CORS para o seu front (ajuste a origin se quiser travar)
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Swagger só em dev (altere se quiser sempre expor)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Metas/Vendas API')
      .setDescription('API de monitoramento de vendas (Cliente → Loja → Funcionário)')
      .setVersion('1.0.0')
      .addBearerAuth() // habilita o cadeado "Authorize" (JWT Bearer)
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // (opcional) desligar app com o Prisma de forma elegante
  // const prisma = app.get(PrismaService);
  // await prisma.enableShutdownHooks(app);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`🚀 API on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📚 Swagger on http://localhost:${port}/docs`);
  }
}
bootstrap();
