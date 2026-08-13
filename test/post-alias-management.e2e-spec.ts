import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Post alias management (e2e)', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 10);
  const publicId = `alias-post-${runId}`;
  const firstAlias = `alias-first-${runId}`;
  const renamedAlias = `alias-renamed-${runId}`;

  let app: INestApplication;
  let prisma: PrismaService;
  let adminId: string;
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
    const jwtService = app.get(JwtService);
    const passwordHash = await argon2.hash('AliasManagement123!');
    const admin = await prisma.user.create({
      data: {
        username: `alias_admin_${runId}`,
        email: `alias_admin_${runId}@example.com`,
        passwordHash,
        role: 'admin',
      },
    });
    adminId = admin.id;
    adminToken = await jwtService.signAsync({
      sub: admin.id,
      username: admin.username,
      role: admin.role,
      authVersion: admin.authVersion,
    });

    await prisma.post.create({
      data: {
        publicId,
        title: 'Alias management test',
        content: 'Alias management test content.',
        status: 'published',
        publishedAt: new Date(),
        authorId: admin.id,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({ where: { publicId } });
      await prisma.user.deleteMany({
        where: { id: { in: [adminId].filter(Boolean) } },
      });
    }
    await app?.close();
  });

  it('creates and lists an alias', async () => {
    await request(app.getHttpServer())
      .post(`/api/posts/${publicId}/alias`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ alias: firstAlias })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/posts/${publicId}/aliases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data).toContain(firstAlias);
  });

  it('renames the alias and resolves the post through the new alias', async () => {
    const rename = await request(app.getHttpServer())
      .patch(
        `/api/posts/${publicId}/alias/${firstAlias}/rename/${renamedAlias}`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(rename.body.data.alias).toBe(renamedAlias);

    const aliases = await request(app.getHttpServer())
      .get(`/api/posts/${publicId}/aliases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(aliases.body.data).toContain(renamedAlias);
    expect(aliases.body.data).not.toContain(firstAlias);

    await request(app.getHttpServer())
      .get(`/api/posts/get/${renamedAlias}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/posts/get/${firstAlias}`)
      .expect(404);
  });

  it('rejects renaming an alias to the same value', async () => {
    await request(app.getHttpServer())
      .patch(
        `/api/posts/${publicId}/alias/${renamedAlias}/rename/${renamedAlias}`,
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('deletes the alias and then returns 404 for it', async () => {
    const deleted = await request(app.getHttpServer())
      .delete(`/api/posts/${publicId}/alias/${renamedAlias}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(deleted.body.data.alias).toBe(renamedAlias);

    const aliases = await request(app.getHttpServer())
      .get(`/api/posts/${publicId}/aliases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(aliases.body.data).toEqual([]);

    await request(app.getHttpServer())
      .delete(`/api/posts/${publicId}/alias/${renamedAlias}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/posts/get/${renamedAlias}`)
      .expect(404);
  });
});
