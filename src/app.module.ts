import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PostsModule } from './modules/posts/posts.module.js';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware.js';

function validateEnvironment(config: Record<string, unknown>) {
  const registrationMode = config.REGISTRATION_MODE;

  if (registrationMode !== 'OPEN' && registrationMode !== 'ADMIN_ONLY') {
    throw new Error('REGISTRATION_MODE must be either "OPEN" or "ADMIN_ONLY"');
  }

  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    PostsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('/api/{*path}');
  }
}
