import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Options (e2e)', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 10);
  const prefix = `OptionTest${runId}`;
  const optionKeys = [
    `${prefix}String`,
    `${prefix}Number`,
    `${prefix}Boolean`,
    `${prefix}Object`,
    `${prefix}Array`,
    `${prefix}Null`,
    `${prefix}Case`,
    `${prefix}SortA`,
    `${prefix}SortB`,
    `${prefix}SortC`,
    `${prefix}Delete`,
  ];

  let app: INestApplication;
  let prisma: PrismaService;
  let adminId: string;
  let editorId: string;
  let userId: string;
  let adminToken: string;
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
    const passwordHash = await argon2.hash('OptionTest123!');

    const [admin, editor, user] = await prisma.$transaction([
      prisma.user.create({
        data: {
          username: `option_admin_${runId}`,
          email: `option_admin_${runId}@example.com`,
          passwordHash,
          role: 'admin',
        },
      }),
      prisma.user.create({
        data: {
          username: `option_editor_${runId}`,
          email: `option_editor_${runId}@example.com`,
          passwordHash,
          role: 'editor',
        },
      }),
      prisma.user.create({
        data: {
          username: `option_user_${runId}`,
          email: `option_user_${runId}@example.com`,
          passwordHash,
          role: 'user',
        },
      }),
    ]);

    adminId = admin.id;
    editorId = editor.id;
    userId = user.id;

    const sign = (userData: typeof admin) =>
      jwtService.signAsync({
        sub: userData.id,
        username: userData.username,
        role: userData.role,
        authVersion: userData.authVersion,
      });

    [adminToken, editorToken, userToken] = await Promise.all([
      sign(admin),
      sign(editor),
      sign(user),
    ]);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.option.deleteMany({ where: { key: { in: optionKeys } } });
      await prisma.user.deleteMany({
        where: { id: { in: [adminId, editorId, userId].filter(Boolean) } },
      });
    }
    await app?.close();
  });

  it('requires authentication on every options endpoint', async () => {
    await request(app.getHttpServer()).get('/api/options').expect(401);
    await request(app.getHttpServer())
      .get(`/api/options/${optionKeys[0]}`)
      .expect(401);
    await request(app.getHttpServer())
      .put(`/api/options/${optionKeys[0]}`)
      .send({ value: true })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/api/options/${optionKeys[0]}`)
      .expect(401);
  });

  it.each([
    ['editor', () => editorToken],
    ['user', () => userToken],
  ])('rejects the %s role on every options endpoint', async (_role, token) => {
    const authorization = `Bearer ${token()}`;

    await request(app.getHttpServer())
      .get('/api/options')
      .set('Authorization', authorization)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/options/${optionKeys[0]}`)
      .set('Authorization', authorization)
      .expect(403);
    await request(app.getHttpServer())
      .put(`/api/options/${optionKeys[0]}`)
      .set('Authorization', authorization)
      .send({ value: true })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/options/${optionKeys[0]}`)
      .set('Authorization', authorization)
      .expect(403);
  });

  it('stores every supported JSON value type', async () => {
    const values = [
      'DreamCMS',
      42,
      true,
      { enabled: true, nested: { count: 2 } },
      ['one', 2, false, null],
      null,
    ];

    for (const [index, value] of values.entries()) {
      const response = await request(app.getHttpServer())
        .put(`/api/options/${optionKeys[index]}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value })
        .expect(200);

      expect(response.body.message).toBe('Option saved successfully');
      expect(response.body.data.value).toEqual(value);
    }
  });

  it('uses CITEXT keys for case-insensitive lookup and update', async () => {
    const key = optionKeys[6];
    const lowerKey = key.toLowerCase();

    await request(app.getHttpServer())
      .put(`/api/options/${key}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'first' })
      .expect(200);

    const getResponse = await request(app.getHttpServer())
      .get(`/api/options/${lowerKey}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(getResponse.body.data.value).toBe('first');

    await request(app.getHttpServer())
      .put(`/api/options/${lowerKey}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'updated' })
      .expect(200);

    expect(await prisma.option.count({ where: { key } })).toBe(1);
    expect((await prisma.option.findUnique({ where: { key } }))?.value).toBe(
      'updated',
    );
  });

  it('returns all options ordered by key', async () => {
    for (const key of [optionKeys[9], optionKeys[7], optionKeys[8]]) {
      await request(app.getHttpServer())
        .put(`/api/options/${key}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: key })
        .expect(200);
    }

    const response = await request(app.getHttpServer())
      .get('/api/options')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const keys = (response.body.data as Array<{ key: string }>)
      .map((option) => option.key)
      .filter((key) => key.startsWith(`${prefix}Sort`));

    expect(keys).toEqual([optionKeys[7], optionKeys[8], optionKeys[9]]);
  });

  it('validates option keys and request bodies', async () => {
    const authorization = `Bearer ${adminToken}`;

    await request(app.getHttpServer())
      .put('/api/options/1invalid')
      .set('Authorization', authorization)
      .send({ value: true })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/options/${'A'.repeat(101)}`)
      .set('Authorization', authorization)
      .send({ value: true })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/options/${optionKeys[0]}`)
      .set('Authorization', authorization)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/options/${optionKeys[0]}`)
      .set('Authorization', authorization)
      .send({ value: true, unknown: true })
      .expect(400);
  });

  it('deletes an option and returns 404 when deleting it again', async () => {
    const key = optionKeys[10];

    await request(app.getHttpServer())
      .put(`/api/options/${key}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'temporary' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .delete(`/api/options/${key}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.message).toBe('Option deleted successfully');

    await request(app.getHttpServer())
      .get(`/api/options/${key}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/options/${key}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
