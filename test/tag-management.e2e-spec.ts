import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Tag management (e2e)', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 10);
  const username = `tag_admin_${runId}`;
  const publicId = `tag-post-${runId}`;
  const oldTag = `TagOld${runId}`;
  const newTag = `TagNew${runId}`;
  const conflictTag = `TagConflict${runId}`;

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
    const passwordHash = await argon2.hash('TagManagement123!');
    const admin = await prisma.user.create({
      data: {
        username,
        email: `${username}@example.com`,
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
        title: 'Tag management test',
        content: 'Published content for tag management.',
        status: 'published',
        publishedAt: new Date(),
        authorId: admin.id,
        tags: {
          create: {
            tag: { create: { name: oldTag } },
          },
        },
      },
    });
    await prisma.tag.create({ data: { name: conflictTag } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({ where: { publicId } });
      await prisma.tag.deleteMany({
        where: { name: { in: [oldTag, newTag, conflictTag] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [adminId].filter(Boolean) } },
      });
    }
    await app?.close();
  });

  it('lists a published post by its tag', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/posts/tags/${oldTag}/posts`)
      .expect(200);

    expect(response.body.pagination.total).toBe(1);
    expect(response.body.data[0].publicId).toBe(publicId);
    expect(response.body.data[0].tags).toContain(oldTag);
  });

  it('lists all tags publicly as names', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/posts/tags')
      .expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining([oldTag, conflictTag]),
    );
    expect(
      response.body.data.every((tag: unknown) => typeof tag === 'string'),
    ).toBe(true);
  });

  it('renames a tag without losing post relations', async () => {
    const renamed = await request(app.getHttpServer())
      .patch(`/api/posts/tags/${oldTag}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: newTag })
      .expect(200);
    expect(renamed.body.data.name).toBe(newTag);

    const oldResult = await request(app.getHttpServer())
      .get(`/api/posts/tags/${oldTag}/posts`)
      .expect(200);
    expect(oldResult.body.pagination.total).toBe(0);

    const newResult = await request(app.getHttpServer())
      .get(`/api/posts/tags/${newTag}/posts`)
      .expect(200);
    expect(newResult.body.pagination.total).toBe(1);
    expect(newResult.body.data[0].tags).toContain(newTag);

    const allTags = await request(app.getHttpServer())
      .get('/api/posts/tags')
      .expect(200);
    expect(allTags.body.data).toContain(newTag);
    expect(allTags.body.data).not.toContain(oldTag);
  });

  it('rejects invalid rename states', async () => {
    await request(app.getHttpServer())
      .patch(`/api/posts/tags/${newTag}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: newTag })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/posts/tags/${newTag}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: conflictTag })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/posts/tags/Missing${runId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Unused${runId}` })
      .expect(404);
  });

  it('deletes a tag and its post relations', async () => {
    const deleted = await request(app.getHttpServer())
      .delete(`/api/posts/tags/${newTag}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(deleted.body.data.name).toBe(newTag);

    const post = await request(app.getHttpServer())
      .get(`/api/posts/${publicId}`)
      .expect(200);
    expect(post.body.data.tags).not.toContain(newTag);

    const allTags = await request(app.getHttpServer())
      .get('/api/posts/tags')
      .expect(200);
    expect(allTags.body.data).not.toContain(newTag);

    await request(app.getHttpServer())
      .delete(`/api/posts/tags/${newTag}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
