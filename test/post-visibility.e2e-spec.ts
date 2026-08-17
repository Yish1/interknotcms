import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Post visibility (e2e)', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 12);
  const passwordHashPromise = argon2.hash('Visibility123!');

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authorId: string;
  let otherUserId: string;
  let adminId: string;
  let publishedPublicId: string;
  let draftPublicId: string;
  let draftAlias: string;
  let authorToken: string;
  let otherUserToken: string;
  let adminToken: string;

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

    const passwordHash = await passwordHashPromise;
    const [author, otherUser, admin] = await prisma.$transaction([
      prisma.user.create({
        data: {
          username: `author_${runId}`,
          email: `author_${runId}@example.com`,
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          username: `other_${runId}`,
          email: `other_${runId}@example.com`,
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          username: `admin_${runId}`,
          email: `admin_${runId}@example.com`,
          passwordHash,
          role: 'admin',
        },
      }),
    ]);

    authorId = author.id;
    otherUserId = otherUser.id;
    adminId = admin.id;
    publishedPublicId = `published-${runId}`;
    draftPublicId = `draft-${runId}`;
    draftAlias = `draft-alias-${runId}`;

    await prisma.$transaction([
      prisma.post.create({
        data: {
          publicId: publishedPublicId,
          title: 'Published visibility test',
          content: 'Published content',
          status: 'published',
          publishedAt: new Date(),
          authorId,
        },
      }),
      prisma.post.create({
        data: {
          publicId: draftPublicId,
          title: 'Draft visibility test',
          content: 'Draft content',
          status: 'draft',
          authorId,
          aliases: {
            create: { alias: draftAlias },
          },
        },
      }),
    ]);

    authorToken = await signToken(author);
    otherUserToken = await signToken(otherUser);
    adminToken = await signToken(admin);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({
        where: { publicId: { in: [publishedPublicId, draftPublicId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [authorId, otherUserId, adminId] } },
      });
    }
    await app?.close();
  });

  async function signToken(user: {
    id: string;
    username: string;
    role: 'admin' | 'editor' | 'user';
    authVersion: number;
  }): Promise<string> {
    return jwtService.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
      authVersion: user.authVersion,
    });
  }

  it('allows a guest to read a published post', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/posts/${publishedPublicId}`)
      .expect(200);

    expect(response.body.data.status).toBe('published');
  });

  it('hides a draft from a guest', async () => {
    await request(app.getHttpServer())
      .get(`/api/posts/${draftPublicId}`)
      .expect(404);
  });

  it('allows the author to read their draft', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/posts/${draftPublicId}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(200);

    expect(response.body.data.authorId).toBe(authorId);
    expect(response.body.data.status).toBe('draft');
  });

  it('hides a draft from another user', async () => {
    await request(app.getHttpServer())
      .get(`/api/posts/${draftPublicId}`)
      .set('Authorization', `Bearer ${otherUserToken}`)
      .expect(404);
  });

  it('allows an admin to read any draft', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/posts/${draftPublicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data.status).toBe('draft');
  });

  it('applies the same draft rules when accessed through an alias', async () => {
    await request(app.getHttpServer())
      .get(`/api/posts/${draftAlias}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/posts/${draftAlias}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(200);
  });

  it('rejects an invalid optional token instead of treating it as a guest', async () => {
    await request(app.getHttpServer())
      .get(`/api/posts/${publishedPublicId}`)
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('applies the same authVersion rule in required and optional guards', async () => {
    const staleToken = await jwtService.signAsync({
      sub: authorId,
      authVersion: 999,
    });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${staleToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/posts/${publishedPublicId}`)
      .set('Authorization', `Bearer ${staleToken}`)
      .expect(401);
  });

  it('applies the same inactive-user rule in required and optional guards', async () => {
    await prisma.user.update({
      where: { id: authorId },
      data: { isActive: false },
    });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/posts/${publishedPublicId}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(401);

    await prisma.user.update({
      where: { id: authorId },
      data: { isActive: true },
    });
  });

  it('applies the same deleted-user rule in required and optional guards', async () => {
    await prisma.user.update({
      where: { id: authorId },
      data: { deletedAt: new Date() },
    });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/posts/${publishedPublicId}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(401);

    await prisma.user.update({
      where: { id: authorId },
      data: { deletedAt: null },
    });
  });
});
