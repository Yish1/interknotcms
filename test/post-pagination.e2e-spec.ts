import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Post pagination (e2e)', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 10);
  const publicIds = Array.from(
    { length: 7 },
    (_, index) => `page-${runId}-${index + 1}`,
  );
  const paginationTag = `PaginationTag${runId}`;

  let app: INestApplication;
  let prisma: PrismaService;
  let editorId: string;
  let userId: string;
  let editorToken: string;
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
    const passwordHash = await argon2.hash('Pagination123!');
    const [editor, user] = await prisma.$transaction([
      prisma.user.create({
        data: {
          username: `page_editor_${runId}`,
          email: `page_editor_${runId}@example.com`,
          passwordHash,
          role: 'editor',
        },
      }),
      prisma.user.create({
        data: {
          username: `page_user_${runId}`,
          email: `page_user_${runId}@example.com`,
          passwordHash,
        },
      }),
    ]);

    editorId = editor.id;
    userId = user.id;
    editorToken = await jwtService.signAsync({
      sub: editor.id,
      username: editor.username,
      role: editor.role,
      authVersion: editor.authVersion,
    });
    userToken = await jwtService.signAsync({
      sub: user.id,
      username: user.username,
      role: user.role,
      authVersion: user.authVersion,
    });

    await prisma.post.createMany({
      data: [
        ...publicIds.slice(0, 3).map((publicId, index) => ({
          publicId,
          title: `Pagination published ${index + 1}`,
          content: 'Published pagination content',
          status: 'published' as const,
          viewCount: 2_000_000,
          publishedAt: new Date(`2099-01-0${3 - index}T00:00:00.000Z`),
          updatedAt: new Date(
            index < 2 ? '2099-02-03T00:00:00.000Z' : '2099-02-01T00:00:00.000Z',
          ),
          authorId: editor.id,
        })),
        ...publicIds.slice(3, 6).map((publicId, index) => ({
          publicId,
          title: `Pagination draft ${index + 1}`,
          content: 'Draft pagination content',
          status: 'draft' as const,
          authorId: editor.id,
        })),
        {
          publicId: publicIds[6],
          title: 'Pagination archived',
          content: 'Archived pagination content',
          status: 'published' as const,
          publishedAt: new Date('2099-01-04T00:00:00.000Z'),
          deletedAt: new Date(),
          authorId: editor.id,
        },
      ],
    });

    const [tag, taggedPost] = await Promise.all([
      prisma.tag.create({ data: { name: paginationTag } }),
      prisma.post.findUniqueOrThrow({
        where: { publicId: publicIds[0] },
        select: { id: true },
      }),
    ]);
    await prisma.postTag.create({
      data: { postId: taggedPost.id, tagId: tag.id },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({ where: { publicId: { in: publicIds } } });
      await prisma.tag.deleteMany({ where: { name: paginationTag } });
      await prisma.user.deleteMany({
        where: { id: { in: [editorId, userId].filter(Boolean) } },
      });
    }
    await app?.close();
  });

  it('paginates public posts and sorts by views', async () => {
    const firstPage = await request(app.getHttpServer())
      .get('/api/posts?page=1&pageSize=2&sort=views')
      .expect(200);

    expect(firstPage.body.data).toHaveLength(2);
    expect(
      firstPage.body.data.map((post: { publicId: string }) => post.publicId),
    ).toEqual([publicIds[1], publicIds[0]]);
    expect(firstPage.body.pagination).toMatchObject({
      page: 1,
      pageSize: 2,
    });
    expect(firstPage.body.pagination.totalPages).toBe(
      Math.ceil(firstPage.body.pagination.total / 2),
    );

    const secondPage = await request(app.getHttpServer())
      .get('/api/posts?page=2&pageSize=2&sort=views')
      .expect(200);

    expect(secondPage.body.data[0].publicId).toBe(publicIds[2]);
    expect(secondPage.body.data).toHaveLength(2);
  });

  it('rejects invalid public pagination parameters', async () => {
    await request(app.getHttpServer())
      .get('/api/posts?page=0&pageSize=51')
      .expect(400);
  });

  it('returns tag posts and pagination at consistent top-level fields', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `/api/posts/tags/${paginationTag.toLowerCase()}/posts?page=1&pageSize=2`,
      )
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data[0].publicId).toBe(publicIds[0]);
    expect(response.body.data.pagination).toBeUndefined();
    expect(response.body.pagination).toEqual({
      page: 1,
      pageSize: 2,
      total: 1,
      totalPages: 1,
    });
  });

  it('paginates an editor own manage posts by status', async () => {
    const firstPage = await request(app.getHttpServer())
      .get('/api/posts/manage?page=1&pageSize=2&status=draft')
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(200);

    expect(firstPage.body.data).toHaveLength(2);
    expect(
      firstPage.body.data.every(
        (post: { status: string }) => post.status === 'draft',
      ),
    ).toBe(true);
    expect(firstPage.body.pagination).toEqual({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });

    const secondPage = await request(app.getHttpServer())
      .get('/api/posts/manage?page=2&pageSize=2&status=draft')
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(200);

    expect(secondPage.body.data).toHaveLength(1);
  });

  it('returns archived posts through manage pagination', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/posts/manage?page=1&pageSize=10&status=archived')
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].publicId).toBe(publicIds[6]);
    expect(response.body.data[0].deletedAt).not.toBeNull();
  });

  it('denies manage pagination to regular users', async () => {
    await request(app.getHttpServer())
      .get('/api/posts/manage')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });
});
