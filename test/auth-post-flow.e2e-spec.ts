import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Authentication and post publishing flow (e2e)', () => {
  const runId = randomUUID().slice(0, 8);
  const username = `e2e_${runId}`;
  const email = `${username}@example.com`;
  const originalPassword = 'Original123!';
  const updatedPassword = 'Updated456!';
  const tagNames = [`e2e-nestjs-${runId}`, `e2e-prisma-${runId}`];

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let userId: string;
  let deletedUserId: string;
  let originalAccessToken: string;
  let renewedAccessToken: string;

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
    jwtService = app.get(JwtService);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash: await argon2.hash(originalPassword),
        role: 'admin',
      },
      select: { id: true },
    });

    userId = user.id;

    const deletedUser = await prisma.user.create({
      data: {
        username: `deleted_${runId}`,
        email: `deleted_${runId}@example.com`,
        passwordHash: await argon2.hash('Deleted123!'),
        deletedAt: new Date(),
      },
      select: { id: true },
    });

    deletedUserId = deletedUser.id;
  });

  afterAll(async () => {
    if (prisma && userId) {
      await prisma.post.deleteMany({ where: { authorId: userId } });
      await prisma.user.deleteMany({
        where: { id: { in: [userId, deletedUserId].filter(Boolean) } },
      });
      await prisma.tag.deleteMany({ where: { name: { in: tagNames } } });
    }

    await app?.close();
  });

  it('logs in with the original password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: originalPassword })
      .expect(200);

    expect(response.body.message).toBe('Login successful');
    expect(response.body.data.user.username).toBe(username);
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.accessToken).toEqual(expect.any(String));

    originalAccessToken = response.body.data.accessToken;
  });

  it('uses the access token to retrieve the current user', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${originalAccessToken}`)
      .expect(200);

    expect(response.body.data.sub).toBe(userId);
    expect(response.body.data.username).toBe(username);
    expect(response.body.data.role).toBe('admin');
  });

  it('changes the password', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/users/${username}`)
      .set('Authorization', `Bearer ${originalAccessToken}`)
      .send({
        oldPassword: originalPassword,
        password: updatedPassword,
      })
      .expect(200);

    expect(response.body.message).toBe('User updated successfully');
    expect(response.body.data.authVersion).toBeUndefined();
  });

  it('rejects the old token after the password changes', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${originalAccessToken}`)
      .expect(401);
  });

  it('logs in with the new password and receives a new token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: updatedPassword })
      .expect(200);

    expect(response.body.data.accessToken).toEqual(expect.any(String));
    renewedAccessToken = response.body.data.accessToken;
  });

  it('rejects an expired token', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { authVersion: true, role: true },
    });

    const shortLivedToken = await jwtService.signAsync(
      {
        sub: userId,
        username,
        role: user.role,
        authVersion: user.authVersion,
      },
      { expiresIn: '1s' },
    );

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${shortLivedToken}`)
      .expect(401);
  });

  it('logs in again to obtain a replacement token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password: updatedPassword })
      .expect(200);

    renewedAccessToken = response.body.data.accessToken;
    expect(renewedAccessToken).toEqual(expect.any(String));
  });

  it('returns a clear conflict when creating an already deleted user', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${renewedAccessToken}`)
      .send({
        username: `deleted_${runId}`,
        email: `another_${runId}@example.com`,
        password: 'Deleted123!',
      })
      .expect(409);

    expect(response.body.message).toBe(
      'User with this username or email was previously deleted, please contact support to restore your account',
    );
  });

  it('publishes a post with the replacement token', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/posts')
      .set('Authorization', `Bearer ${renewedAccessToken}`)
      .send({
        title: 'E2E authentication flow post',
        content: 'This post verifies the complete authenticated workflow.',
        summary: 'Authentication flow test',
        status: 'published',
        tags: [...tagNames, tagNames[0]],
      })
      .expect(201);

    expect(response.body.message).toBe('Post created successfully');
    expect(response.body.data.authorId).toBe(userId);
    expect(response.body.data.status).toBe('published');
    expect(response.body.data.publishedAt).not.toBeNull();
  });

  it('rejects creating a post with more than 8 tags', async () => {
    await request(app.getHttpServer())
      .post('/api/posts')
      .set('Authorization', `Bearer ${renewedAccessToken}`)
      .send({
        title: 'Too many tags',
        content: 'This request must be rejected before reaching Prisma.',
        status: 'draft',
        tags: Array.from({ length: 9 }, (_, index) => `tag-${index}`),
      })
      .expect(400);
  });
});
