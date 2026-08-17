import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { Prisma } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Registration mode option (e2e)', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 10);
  const username = `registration_${runId}`;
  const email = `${username}@example.com`;

  let app: INestApplication;
  let prisma: PrismaService;
  let originalOption: {
    key: string;
    value: Prisma.JsonValue;
    updatedAt: Date;
  } | null;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    originalOption = await prisma.option.findUnique({
      where: { key: 'registration_mode' },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { username } });

      if (originalOption) {
        const value =
          originalOption.value === null
            ? Prisma.JsonNull
            : (originalOption.value as Prisma.InputJsonValue);
        await prisma.option.upsert({
          where: { key: 'registration_mode' },
          update: { value },
          create: { key: 'registration_mode', value },
        });
      } else {
        await prisma.option.deleteMany({
          where: { key: 'registration_mode' },
        });
      }
    }

    await app?.close();
  });

  it('blocks guest registration when the database option is ADMIN_ONLY', async () => {
    await prisma.option.upsert({
      where: { key: 'registration_mode' },
      update: { value: 'ADMIN_ONLY' },
      create: { key: 'registration_mode', value: 'ADMIN_ONLY' },
    });

    await request(app.getHttpServer())
      .post('/api/users')
      .send({ username, email, password: 'Registration123!' })
      .expect(403);
  });

  it('allows a guest to create only a user when the database option is OPEN', async () => {
    await prisma.option.update({
      where: { key: 'registration_mode' },
      data: { value: 'OPEN' },
    });

    const response = await request(app.getHttpServer())
      .post('/api/users')
      .send({ username, email, password: 'Registration123!' })
      .expect(201);

    expect(response.body.data.role).toBe('user');
  });

  it('fails closed when registration_mode contains an invalid value', async () => {
    await prisma.option.update({
      where: { key: 'registration_mode' },
      data: { value: true },
    });

    await request(app.getHttpServer())
      .post('/api/users')
      .send({
        username: `invalid_${runId}`,
        email: `invalid_${runId}@example.com`,
        password: 'Registration123!',
      })
      .expect(403);
  });
});
