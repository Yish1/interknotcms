import type { CookieOptions, Response } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 分钟
export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

function isSecureCookie(): boolean {
  return process.env.COOKIE_SECURE === 'true';
}

function getBaseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: 'lax',
  };
}

export function setAccessTokenCookie(
  response: Response,
  accessToken: string,
): void {
  response.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...getBaseCookieOptions(),
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });
}

//Refresh token 只用于刷新 access token，所以只在 /api/auth 路径下有效
export function setRefreshTokenCookie(
  response: Response,
  refreshToken: string,
): void {
  response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...getBaseCookieOptions(),
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

// 同时设置access token和refresh token的cookie
export function setAuthCookies(
  response: Response,
  accessToken: string,
  refreshToken: string,
): void {
  setAccessTokenCookie(response, accessToken);
  setRefreshTokenCookie(response, refreshToken);
}

// 清除access token和refresh token的cookie
export function clearAuthCookies(response: Response): void {
  response.clearCookie(ACCESS_TOKEN_COOKIE, {
    ...getBaseCookieOptions(),
    path: '/',
  });
  response.clearCookie(REFRESH_TOKEN_COOKIE, {
    ...getBaseCookieOptions(),
    path: '/api/auth',
  });
}
