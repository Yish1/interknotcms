import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 使用 Helmet 增强安全性
  app.use(helmet());
  app.use(cookieParser());

  // 启用 CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()), // 允许的来源，可以根据需要进行配置
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // 允许的 HTTP 方法
    allowedHeaders: 'Content-Type, Accept, Authorization', // 允许的请求头
    credentials: true, // 是否允许发送 Cookie
  });

  // 设置全局路由为/api/
  app.setGlobalPrefix('api');

  // 开启输入校验
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动去除 DTO 中未定义的属性
      forbidNonWhitelisted: true, // 如果请求中包含未定义的属性，则抛出异常
      transform: true, // 自动将请求数据转换为 DTO 实例
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('DreamCMS API')
    .setDescription('DreamCMS content management API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Bearer Access Token，用于Swagger、curl和第三方客户端',
      },
      'access-token',
    )
    .addCookieAuth(
      'access_token',
      {
        type: 'apiKey',
        in: 'cookie',
        description: '登录后由服务器设置的HttpOnly Access Token Cookie',
      },
      'access-cookie',
    )
    .addCookieAuth(
      'refresh_token',
      {
        type: 'apiKey',
        in: 'cookie',
        description: '仅用于/api/auth/refresh的HttpOnly Refresh Token Cookie',
      },
      'refresh-cookie',
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
