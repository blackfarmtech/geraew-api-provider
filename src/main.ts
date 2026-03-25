import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import { AppModule } from './app.module';
import { DatabaseLogger } from './logging/database.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const dbLogger = app.get(DatabaseLogger);
  app.useLogger(dbLogger);

  app.enableCors();
  app.use(json({ limit: '50mb' }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Gemini Videos API')
    .setDescription('API para geração de vídeos usando Google Vertex AI (Veo)')
    .setVersion('2.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = 3008;
  dbLogger.log(`Server running on port ${port}`, 'Bootstrap');
  dbLogger.log(`Swagger docs at http://localhost:${port}/docs`, 'Bootstrap');
  await app.listen(port);
}
bootstrap();
