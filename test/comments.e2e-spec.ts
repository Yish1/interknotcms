import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Comments (e2e)', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 10);
  const ownerPublicId = `comment-owner-${runId}`;
  const otherPublicId = `comment-other-${runId}`;

  let app: INestApplication;
  let prisma: PrismaService;
  let ownerId: string;
  let otherEditorId: string;
  let userId: string;
  let adminId: string;
  let ownerToken: string;
  let otherEditorToken: string;
  let userToken: string;
  let adminToken: string;
  let ownerPostId: number;
  let otherPostId: number;
  let rootId: string;
  let firstReplyId: string;

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
    const passwordHash = await argon2.hash('CommentTest123!');

    const [admin, owner, otherEditor, user] = await prisma.$transaction([
      prisma.user.create({
        data: {
          username: `comment_admin_${runId}`,
          email: `comment_admin_${runId}@example.com`,
          passwordHash,
          role: 'admin',
        },
      }),
      prisma.user.create({
        data: {
          username: `comment_owner_${runId}`,
          email: `comment_owner_${runId}@example.com`,
          passwordHash,
          role: 'editor',
        },
      }),
      prisma.user.create({
        data: {
          username: `comment_other_${runId}`,
          email: `comment_other_${runId}@example.com`,
          passwordHash,
          role: 'editor',
        },
      }),
      prisma.user.create({
        data: {
          username: `comment_user_${runId}`,
          email: `comment_user_${runId}@example.com`,
          passwordHash,
          role: 'user',
        },
      }),
    ]);

    adminId = admin.id;
    ownerId = owner.id;
    otherEditorId = otherEditor.id;
    userId = user.id;

    const sign = (userData: typeof admin) =>
      jwtService.signAsync({
        sub: userData.id,
        username: userData.username,
        role: userData.role,
        authVersion: userData.authVersion,
      });

    [adminToken, ownerToken, otherEditorToken, userToken] = await Promise.all([
      sign(admin),
      sign(owner),
      sign(otherEditor),
      sign(user),
    ]);

    const [ownerPost, otherPost] = await prisma.$transaction([
      prisma.post.create({
        data: {
          publicId: ownerPublicId,
          title: 'Owner comment test post',
          content: 'Owner comment test content',
          status: 'published',
          publishedAt: new Date(),
          authorId: owner.id,
        },
      }),
      prisma.post.create({
        data: {
          publicId: otherPublicId,
          title: 'Other editor comment test post',
          content: 'Other editor comment test content',
          status: 'published',
          publishedAt: new Date(),
          authorId: otherEditor.id,
        },
      }),
    ]);

    ownerPostId = ownerPost.id;
    otherPostId = otherPost.id;

    const root = await prisma.comment.create({
      data: {
        content: 'Nested root',
        status: 'approved',
        ip: '127.0.0.1',
        userId: user.id,
        postId: ownerPost.id,
      },
    });
    rootId = root.id;

    const firstReply = await prisma.comment.create({
      data: {
        content: 'Nested reply level 1',
        status: 'approved',
        ip: '127.0.0.1',
        userId: owner.id,
        postId: ownerPost.id,
        parentId: root.id,
      },
    });
    firstReplyId = firstReply.id;

    await prisma.comment.createMany({
      data: [
        {
          content: 'Nested reply level 2',
          status: 'approved',
          ip: '127.0.0.1',
          userId: admin.id,
          postId: ownerPost.id,
          parentId: firstReply.id,
        },
        {
          content: 'Second root',
          status: 'approved',
          ip: '127.0.0.1',
          userId: user.id,
          postId: ownerPost.id,
        },
      ],
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.post.deleteMany({
        where: { publicId: { in: [ownerPublicId, otherPublicId] } },
      });
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [adminId, ownerId, otherEditorId, userId].filter(Boolean),
          },
        },
      });
    }
    await app?.close();
  });

  it('returns a paginated root with its complete nested reply tree', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/comments/post/${ownerPublicId}?page=1&pageSize=1`)
      .expect(200);

    expect(response.body.pagination).toEqual({
      total: 2,
      page: 1,
      pageSize: 1,
      totalPages: 2,
    });
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(rootId);
    expect(response.body.data[0].replies[0].id).toBe(firstReplyId);
    expect(response.body.data[0].replies[0].replies[0].content).toBe(
      'Nested reply level 2',
    );
    expect(response.body.data[0].deletedAt).toBeUndefined();
  });

  it('returns the next root page without orphan replies', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/comments/post/${ownerPublicId}?page=2&pageSize=1`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].content).toBe('Second root');
    expect(response.body.data[0].replies).toEqual([]);
  });

  it('rejects invalid pagination and blank content', async () => {
    await request(app.getHttpServer())
      .get(`/api/comments/post/${ownerPublicId}?page=0&pageSize=51`)
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/comments/post/${ownerPublicId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ content: ' \n\t ' })
      .expect(400);
  });

  it('requires authentication to create comments and review pending comments', async () => {
    await request(app.getHttpServer())
      .post(`/api/comments/post/${ownerPublicId}`)
      .send({ content: 'Guest comment' })
      .expect(401);

    await request(app.getHttpServer()).get('/api/comments/pending').expect(401);

    await request(app.getHttpServer())
      .get('/api/comments/pending')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('applies review rules to users, owner editors, and other editors', async () => {
    const userComment = await request(app.getHttpServer())
      .post(`/api/comments/post/${ownerPublicId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ content: 'User pending comment' })
      .expect(201);
    expect(userComment.body.data.status).toBe('pending');

    const ownerComment = await request(app.getHttpServer())
      .post(`/api/comments/post/${ownerPublicId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: 'Owner editor approved comment' })
      .expect(201);
    expect(ownerComment.body.data.status).toBe('approved');

    const otherEditorComment = await request(app.getHttpServer())
      .post(`/api/comments/post/${ownerPublicId}`)
      .set('Authorization', `Bearer ${otherEditorToken}`)
      .send({ content: 'Other editor pending comment' })
      .expect(201);
    expect(otherEditorComment.body.data.status).toBe('pending');

    const ownerPending = await request(app.getHttpServer())
      .get('/api/comments/pending')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(ownerPending.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: userComment.body.data.id }),
        expect.objectContaining({ id: otherEditorComment.body.data.id }),
      ]),
    );

    const otherPending = await request(app.getHttpServer())
      .get('/api/comments/pending')
      .set('Authorization', `Bearer ${otherEditorToken}`)
      .expect(200);
    expect(otherPending.body.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: userComment.body.data.id }),
      ]),
    );

    await request(app.getHttpServer())
      .post(`/api/comments/approve/${userComment.body.data.id}`)
      .set('Authorization', `Bearer ${otherEditorToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/comments/approve/${userComment.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
  });

  it('rejects invalid, cross-post, and unapproved parent comments', async () => {
    await request(app.getHttpServer())
      .post(`/api/comments/post/${ownerPublicId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ content: 'Invalid parent', parentId: randomUUID() })
      .expect(400);

    const otherRoot = await prisma.comment.create({
      data: {
        content: 'Other post root',
        status: 'approved',
        ip: '127.0.0.1',
        userId,
        postId: otherPostId,
      },
    });
    await request(app.getHttpServer())
      .post(`/api/comments/post/${ownerPublicId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ content: 'Cross-post reply', parentId: otherRoot.id })
      .expect(400);

    const pendingParent = await prisma.comment.create({
      data: {
        content: 'Pending parent',
        status: 'pending',
        ip: '127.0.0.1',
        userId,
        postId: ownerPostId,
      },
    });
    await request(app.getHttpServer())
      .post(`/api/comments/post/${ownerPublicId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ content: 'Reply to pending parent', parentId: pendingParent.id })
      .expect(400);
  });

  it('enforces comment deletion permissions and validates UUIDs', async () => {
    await request(app.getHttpServer())
      .delete('/api/comments/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const target = await prisma.comment.create({
      data: {
        content: 'Deletion target',
        status: 'approved',
        ip: '127.0.0.1',
        userId,
        postId: ownerPostId,
      },
    });

    await request(app.getHttpServer())
      .delete(`/api/comments/${target.id}`)
      .set('Authorization', `Bearer ${otherEditorToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/comments/${target.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const adminTarget = await prisma.comment.create({
      data: {
        content: 'Admin deletion target',
        status: 'approved',
        ip: '127.0.0.1',
        userId: ownerId,
        postId: ownerPostId,
      },
    });
    await request(app.getHttpServer())
      .delete(`/api/comments/${adminTarget.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});
