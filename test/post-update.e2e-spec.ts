import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Post update security and workflow (e2e)', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 10);
  const ownPublicId = `update-own-${runId}`;
  const otherPublicId = `update-other-${runId}`;
  const deletedPublicId = `update-deleted-${runId}`;
  const permanentPublicId = `update-permanent-${runId}`;
  const tagNames = [`UpdateOld${runId}`, `UpdateNew${runId}`];
  const sharedTag = `UpdateShared${runId}`;
  const permanentTag = `UpdatePermanent${runId}`;
  const maxLengthTag = `Tag${runId}`.padEnd(100, 'x');

  let app: INestApplication;
  let prisma: PrismaService;
  let editorId: string;
  let otherEditorId: string;
  let adminId: string;
  let userId: string;
  let editorToken: string;
  let adminToken: string;
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
    const passwordHash = await argon2.hash('PostUpdate123!');
    const [editor, otherEditor, admin, user] = await prisma.$transaction([
      prisma.user.create({
        data: {
          username: `update_editor_${runId}`,
          email: `update_editor_${runId}@example.com`,
          passwordHash,
          role: 'editor',
        },
      }),
      prisma.user.create({
        data: {
          username: `update_other_${runId}`,
          email: `update_other_${runId}@example.com`,
          passwordHash,
          role: 'editor',
        },
      }),
      prisma.user.create({
        data: {
          username: `update_admin_${runId}`,
          email: `update_admin_${runId}@example.com`,
          passwordHash,
          role: 'admin',
        },
      }),
      prisma.user.create({
        data: {
          username: `update_user_${runId}`,
          email: `update_user_${runId}@example.com`,
          passwordHash,
        },
      }),
    ]);

    editorId = editor.id;
    otherEditorId = otherEditor.id;
    adminId = admin.id;
    userId = user.id;

    const sign = (account: typeof editor) =>
      jwtService.signAsync({
        sub: account.id,
        username: account.username,
        role: account.role,
        authVersion: account.authVersion,
      });
    [editorToken, adminToken, userToken] = await Promise.all([
      sign(editor),
      sign(admin),
      sign(user),
    ]);

    await prisma.$transaction([
      prisma.post.create({
        data: {
          publicId: ownPublicId,
          title: 'Editor original title',
          content: 'Editor original content',
          summary: 'Editor original summary',
          status: 'draft',
          authorId: editor.id,
          tags: {
            create: {
              tag: {
                connectOrCreate: {
                  where: { name: tagNames[0] },
                  create: { name: tagNames[0] },
                },
              },
            },
          },
        },
      }),
      prisma.post.create({
        data: {
          publicId: otherPublicId,
          title: 'Other editor post',
          content: 'Other editor content',
          status: 'draft',
          authorId: otherEditor.id,
        },
      }),
      prisma.post.create({
        data: {
          publicId: deletedPublicId,
          title: 'Deleted update post',
          content: 'Deleted content',
          status: 'draft',
          deletedAt: new Date(),
          authorId: editor.id,
        },
      }),
    ]);

    await prisma.post.update({
      where: { publicId: ownPublicId },
      data: {
        tags: {
          create: {
            tag: {
              connectOrCreate: {
                where: { name: sharedTag },
                create: { name: sharedTag },
              },
            },
          },
        },
      },
    });
    await prisma.post.update({
      where: { publicId: otherPublicId },
      data: {
        tags: {
          create: {
            tag: { connect: { name: sharedTag } },
          },
        },
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({
        where: {
          publicId: {
            in: [
              ownPublicId,
              otherPublicId,
              deletedPublicId,
              permanentPublicId,
            ],
          },
        },
      });
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [editorId, otherEditorId, adminId, userId].filter(Boolean),
          },
        },
      });
      await prisma.tag.deleteMany({
        where: {
          name: {
            in: [...tagNames, sharedTag, permanentTag, maxLengthTag],
          },
        },
      });
    }
    await app?.close();
  });

  it('allows an editor to update their title and summary', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/posts/${ownPublicId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        title: 'Editor updated title',
        summary: 'Editor updated summary',
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      title: 'Editor updated title',
      summary: 'Editor updated summary',
    });
  });

  it('accepts a 300-character summary', async () => {
    const summary = 's'.repeat(300);
    const response = await request(app.getHttpServer())
      .patch(`/api/posts/${ownPublicId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ summary })
      .expect(200);

    expect(response.body.data.summary).toBe(summary);
  });

  it('allows an editor to replace and deduplicate their tags', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/posts/${ownPublicId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ tags: [tagNames[1], tagNames[1].toLowerCase()] })
      .expect(200);

    expect(response.body.data.tags).toEqual([tagNames[1]]);
    const links = await prisma.postTag.count({
      where: { post: { publicId: ownPublicId } },
    });
    expect(links).toBe(1);
    await expect(
      prisma.tag.findUnique({ where: { name: tagNames[0] } }),
    ).resolves.toBeNull();
    await expect(
      prisma.tag.findUnique({ where: { name: sharedTag } }),
    ).resolves.not.toBeNull();
  });

  it('accepts and persists a 100-character tag', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/posts/${ownPublicId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ tags: [maxLengthTag] })
      .expect(200);

    expect(response.body.data.tags).toEqual([maxLengthTag]);
  });

  it('returns 403 when an editor updates another editor post', async () => {
    await request(app.getHttpServer())
      .patch(`/api/posts/${otherPublicId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Unauthorized title' })
      .expect(403);
  });

  it('prevents an editor from changing authorId', async () => {
    await request(app.getHttpServer())
      .patch(`/api/posts/${ownPublicId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ authorId: otherEditorId })
      .expect(403);
  });

  it('allows an admin to update any post and transfer its author', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/posts/${otherPublicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Admin updated title', authorId: editorId })
      .expect(200);

    expect(response.body.data.title).toBe('Admin updated title');
    expect(response.body.data.author.username).toBe(`update_editor_${runId}`);
  });

  it('sets publishedAt when draft becomes published', async () => {
    const before = Date.now();
    const response = await request(app.getHttpServer())
      .patch(`/api/posts/${ownPublicId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ status: 'published' })
      .expect(200);

    expect(response.body.data.status).toBe('published');
    expect(
      new Date(response.body.data.publishedAt).getTime(),
    ).toBeGreaterThanOrEqual(before);
  });

  it('keeps publishedAt when an already published post is edited', async () => {
    const before = await prisma.post.findUniqueOrThrow({
      where: { publicId: ownPublicId },
      select: { publishedAt: true },
    });
    const response = await request(app.getHttpServer())
      .patch(`/api/posts/${ownPublicId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ summary: 'Published summary edit' })
      .expect(200);

    expect(response.body.data.publishedAt).toBe(
      before.publishedAt?.toISOString(),
    );
  });

  it('clears publishedAt when published becomes draft', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/posts/${ownPublicId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ status: 'draft' })
      .expect(200);

    expect(response.body.data.status).toBe('draft');
    expect(response.body.data.publishedAt).toBeNull();
  });

  it('requires authentication and rejects regular users', async () => {
    await request(app.getHttpServer())
      .patch(`/api/posts/${ownPublicId}`)
      .send({ title: 'No token' })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/posts/${ownPublicId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'Regular user' })
      .expect(403);
  });

  it.each([
    ['invalid status', { status: 'archived' }],
    ['invalid author UUID', { authorId: "' OR 1=1 --" }],
    ['wrong tags type', { tags: 'not-an-array' }],
    ['empty tag', { tags: [''] }],
    ['whitespace-only tag', { tags: ['   '] }],
    ['tag containing spaces', { tags: ['Nest JS'] }],
    ['tag containing special characters', { tags: ['Nest-JS'] }],
    ['wrong title type', { title: { $ne: null } }],
    ['summary longer than 300 characters', { summary: 's'.repeat(301) }],
    ['unknown protected field', { viewCount: 999999 }],
    ['overlong tag', { tags: ['x'.repeat(101)] }],
    [
      'more than 8 tags',
      { tags: Array.from({ length: 9 }, (_, index) => `tag${index}`) },
    ],
  ])('returns 400 for %s', async (_name, payload) => {
    await request(app.getHttpServer())
      .patch(`/api/posts/${ownPublicId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send(payload)
      .expect(400);
  });

  it('treats an SQL-injection-shaped identifier as data', async () => {
    await request(app.getHttpServer())
      .patch(`/api/posts/${encodeURIComponent("' OR 1=1 --")}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Injection attempt' })
      .expect(404);

    const unchanged = await prisma.post.findUniqueOrThrow({
      where: { publicId: ownPublicId },
      select: { title: true },
    });
    expect(unchanged.title).not.toBe('Injection attempt');
  });

  it('returns 404 for missing and deleted posts', async () => {
    await request(app.getHttpServer())
      .patch('/api/posts/missing-post')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Missing' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/posts/${deletedPublicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Deleted' })
      .expect(404);
  });

  it('returns 400 when admin supplies an inactive author', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .patch(`/api/posts/${ownPublicId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ authorId: userId })
      .expect(400);
  });

  it('returns a flat response when permanently deleting a post', async () => {
    await prisma.post.create({
      data: {
        publicId: permanentPublicId,
        title: 'Permanent response test',
        content: 'Permanent response content',
        status: 'draft',
        deletedAt: new Date(),
        authorId: editorId,
        tags: {
          create: {
            tag: {
              create: { name: permanentTag },
            },
          },
        },
      },
    });

    const response = await request(app.getHttpServer())
      .delete(`/api/posts/${permanentPublicId}/permanent`)
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(200);

    expect(response.body).toEqual({
      message: 'Post permanently deleted successfully',
      data: {
        publicId: permanentPublicId,
        title: 'Permanent response test',
      },
    });
    await expect(
      prisma.tag.findUnique({ where: { name: permanentTag } }),
    ).resolves.toBeNull();
  });
});
