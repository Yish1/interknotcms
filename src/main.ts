import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 使用 Helmet 增强安全性
  app.use(helmet());

  // 启用 CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()), // 允许的来源，可以根据需要进行配置
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // 允许的 HTTP 方法
    allowedHeaders: 'Content-Type, Accept, Authorization', // 允许的请求头
  });

  // 设置全局路由为/api/
  app.setGlobalPrefix('api');

  // 开启输入校验
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // 自动去除 DTO 中未定义的属性
    forbidNonWhitelisted: true, // 如果请求中包含未定义的属性，则抛出异常
    transform: true, // 自动将请求数据转换为 DTO 实例
  }));
  
  const swaggerConfig = new DocumentBuilder()
    .setTitle('DreamCMS API')
    .setDescription('DreamCMS content management API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build();

  const documentFactory = () =>
    SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, documentFactory, {
    useGlobalPrefix: true,
    customSiteTitle: 'DreamCMS API Documentation',
  });


  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();