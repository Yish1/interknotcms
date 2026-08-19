import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Cookie authentication (e2e)', () => {
  const runId = randomUUID().slice(0, 8);
  const username = `cookie_${runId}`;
  const email = `${username}@example.com`;
  const password = 'CookieTest123!';

  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let accessToken: string;
  let refreshToken: string;
  let agent: ReturnType<typeof request.agent>;

  /** 从Set-Cookie响应头中提取指定Cookie的值。 */
  function extractCookieValue(cookies: string[], name: string): string {
    const cookie = cookies.find((value) => value.startsWith(`${name}=`));

    if (!cookie) {
      throw new Error(`Cookie ${name} was not found`);
    }

    return cookie.slice(name.length + 1).split(';', 1)[0];
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
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
    agent = request.agent(app.getHttpServer());

    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash: await argon2.hash(password),
        role: 'admin',
      },
      select: {
        id: true,
      },
    });

    userId = user.id;
  });

  afterAll(async () => {
    if (prisma && userId) {
      await prisma.user.deleteMany({
        where: {
          id: userId,
        },
      });
    }

    await app?.close();
  });

  it('sets access and refresh cookies after login', async () => {
    const response = await agent
      .post('/api/auth/login')
      .send({
        username,
        password,
      })
      .expect(200);

    expect(response.body.message).toBe('Login successful');
    expect(response.body.data.user.username).toBe(username);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toBeUndefined();

    const cookies = response.headers['set-cookie'];

    expect(Array.isArray(cookies)).toBe(true);

    const cookieList = cookies as unknown as string[];
    const accessCookie = cookieList.find((cookie) =>
      cookie.startsWith('access_token='),
    );
    const refreshCookie = cookieList.find((cookie) =>
      cookie.startsWith('refresh_token='),
    );

    expect(accessCookie).toContain('HttpOnly');
    expect(accessCookie).toContain('SameSite=Lax');
    expect(accessCookie).toContain('Path=/');
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Lax');
    expect(refreshCookie).toContain('Path=/api/auth');

    accessToken = response.body.data.accessToken;
    refreshToken = extractCookieValue(cookieList, 'refresh_token');
  });

  it('authenticates using only the access cookie', async () => {
    const response = await agent.get('/api/auth/me').expect(200);

    expect(response.body.data.sub).toBe(userId);
    expect(response.body.data.username).toBe(username);
    expect(response.body.data.role).toBe('admin');
  });

  it('keeps bearer authentication compatible', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.sub).toBe(userId);
  });

  it('refreshes the access token without replacing the refresh token', async () => {
    const response = await agent.post('/api/auth/refresh').expect(200);

    expect(response.body.message).toBe('Access token refreshed successfully');
    expect(response.body.data.accessToken).toEqual(expect.any(String));

    const cookies = response.headers['set-cookie'] as unknown as
      string[] | undefined;

    expect(cookies).toEqual(expect.any(Array));
    expect(cookies?.some((cookie) => cookie.startsWith('access_token='))).toBe(
      true,
    );
    expect(cookies?.some((cookie) => cookie.startsWith('refresh_token='))).toBe(
      false,
    );
  });

  it('rejects refresh without a refresh cookie', async () => {
    await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
  });

  it('rejects a refresh token used as an access token', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `access_token=${refreshToken}`)
      .expect(401);
  });

  it('clears cookies and invalidates the session after logout', async () => {
    const logoutResponse = await agent.post('/api/auth/logout').expect(201);
    const cookies = logoutResponse.headers['set-cookie'] as unknown as
      string[] | undefined;

    expect(cookies).toEqual(expect.any(Array));
    expect(
      cookies?.some(
        (cookie) =>
          cookie.startsWith('access_token=') && cookie.includes('Expires='),
      ),
    ).toBe(true);
    expect(
      cookies?.some(
        (cookie) =>
          cookie.startsWith('refresh_token=') && cookie.includes('Expires='),
      ),
    ).toBe(true);

    await agent.get('/api/auth/me').expect(401);
    await agent.post('/api/auth/refresh').expect(401);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });
});
