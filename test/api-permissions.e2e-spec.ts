import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Guest and user API permissions (e2e)', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 12);
  const adminUsername = `permission_admin_${runId}`;
  const userUsername = `permission_user_${runId}`;
  const publicId = `permission-${runId}`;
  const tagName = `PermissionTag${runId}`;

  let app: INestApplication;
  let prisma: PrismaService;
  let adminId: string;
  let userId: string;
  let userToken: string;

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
    const jwtService = app.get(JwtService);
    const passwordHash = await argon2.hash('Permission123!');
    const [admin, user] = await prisma.$transaction([
      prisma.user.create({
        data: {
          username: adminUsername,
          email: `${adminUsername}@example.com`,
          passwordHash,
          role: 'admin',
        },
      }),
      prisma.user.create({
        data: {
          username: userUsername,
          email: `${userUsername}@example.com`,
          passwordHash,
        },
      }),
    ]);

    adminId = admin.id;
    userId = user.id;
    userToken = await jwtService.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
      authVersion: user.authVersion,
    });
    await prisma.post.create({
      data: {
        publicId,
        title: 'Permission test post',
        content: 'Published content for permission tests.',
        status: 'published',
        publishedAt: new Date(),
        authorId: admin.id,
        tags: {
          create: {
            tag: { create: { name: tagName } },
          },
        },
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({ where: { publicId } });
      await prisma.tag.deleteMany({ where: { name: tagName } });
      await prisma.user.deleteMany({
        where: { id: { in: [adminId, userId].filter(Boolean) } },
      });
    }
    await app?.close();
  });

  describe('guest', () => {
    it('can list and read published posts', async () => {
      await request(app.getHttpServer()).get('/api/posts').expect(200);
      await request(app.getHttpServer())
        .get(`/api/posts/${publicId}`)
        .expect(200);
    });

    it.each([
      ['GET', '/api/auth/me'],
      ['GET', '/api/users'],
      ['GET', `/api/users/${adminUsername}`],
      ['GET', '/api/posts/manage'],
      ['GET', `/api/posts/${publicId}/aliases`],
      ['DELETE', `/api/posts/${publicId}`],
      ['PATCH', `/api/posts/${publicId}/restore`],
      ['DELETE', `/api/posts/${publicId}/permanent`],
      ['DELETE', `/api/posts/${publicId}/aliases/missing`],
      ['PATCH', `/api/posts/${publicId}/aliases/old`],
      ['PATCH', `/api/posts/tags/${tagName}`],
      ['DELETE', `/api/posts/tags/${tagName}`],
    ])('cannot call protected endpoint %s %s', async (method, path) => {
      const testRequest = request(app.getHttpServer())[
        method.toLowerCase() as 'get'
      ](path);
      if (path.includes('/aliases/old')) {
        testRequest.send({ alias: 'new' });
      } else if (method === 'PATCH' && path.includes('/posts/tags/')) {
        testRequest.send({ name: `Renamed${runId}` });
      }
      await testRequest.expect(401);
    });

    it('cannot create, update, or add an alias to a post', async () => {
      await request(app.getHttpServer())
        .post('/api/posts')
        .send({ title: 'Guest post', content: 'Rejected' })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/posts/${publicId}`)
        .send({ title: 'Guest update' })
        .expect(401);
      await request(app.getHttpServer())
        .post(`/api/posts/${publicId}/aliases`)
        .send({ alias: `guest-forbidden-${runId}` })
        .expect(401);
    });
  });

  describe('user', () => {
    it('can view their session and another user profile', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/users/${adminUsername}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('can read a published post', async () => {
      await request(app.getHttpServer())
        .get(`/api/posts/${publicId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it.each([
      ['GET', '/api/users'],
      ['GET', '/api/posts/manage'],
      ['GET', `/api/posts/${publicId}/aliases`],
      ['DELETE', `/api/users/${adminUsername}`],
      ['DELETE', `/api/posts/${publicId}`],
      ['PATCH', `/api/posts/${publicId}/restore`],
      ['DELETE', `/api/posts/${publicId}/permanent`],
      ['DELETE', `/api/posts/${publicId}/aliases/missing`],
      ['PATCH', `/api/posts/${publicId}/aliases/old`],
      ['PATCH', `/api/posts/tags/${tagName}`],
      ['DELETE', `/api/posts/tags/${tagName}`],
    ])('is forbidden from privileged endpoint %s %s', async (method, path) => {
      const testRequest = request(app.getHttpServer())
        [method.toLowerCase() as 'get'](path)
        .set('Authorization', `Bearer ${userToken}`);
      if (path.includes('/aliases/old')) {
        testRequest.send({ alias: 'new' });
      } else if (method === 'PATCH' && path.includes('/posts/tags/')) {
        testRequest.send({ name: `Renamed${runId}` });
      }
      await testRequest.expect(403);
    });

    it('cannot create, update, or add an alias to an admin post', async () => {
      await request(app.getHttpServer())
        .post('/api/posts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'User post', content: 'Rejected' })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/posts/${publicId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'User update' })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/posts/${publicId}/aliases`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ alias: `forbidden-${runId}` })
        .expect(403);
    });
  });
});
