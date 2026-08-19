import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service.js';

interface AccessTokenPayload {
  sub: string;
  authVersion: number;
  type: 'access';
}

export interface AuthenticatedUser {
  sub: string;
  role: 'admin' | 'editor' | 'user';
  authVersion: number;
  username: string;
}

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /** 从 Authorization 头中提取 Bearer Token */
  extractBearerToken(authorization: unknown): string | undefined {
    if (authorization === undefined) {
      return undefined;
    }

    if (typeof authorization !== 'string') {
      throw new UnauthorizedException('Invalid token');
    }

    const parts = authorization.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      throw new UnauthorizedException('Invalid token');
    }

    return parts[1];
  }

  /** 从Bearer请求头或Cookie中提取Access Token。 */
  extractToken(
    authorization: unknown,
    cookieAccessToken: unknown,
  ): string | undefined {
    const bearerToken = this.extractBearerToken(authorization);

    if (bearerToken) {
      return bearerToken;
    }

    if (cookieAccessToken === undefined) {
      return undefined;
    }

    if (typeof cookieAccessToken !== 'string') {
      throw new UnauthorizedException('Invalid token');
    }

    return cookieAccessToken;
  }

  /** 为已经通过身份验证的用户创建Access Token */
  async create(user: AuthenticatedUser): Promise<string> {
    return this.jwtService.signAsync({
      sub: user.sub,
      username: user.username,
      role: user.role,
      authVersion: user.authVersion,
      type: 'access',
    });
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    let payload: AccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      !isUUID(payload.sub) ||
      !Number.isInteger(payload.authVersion)
    ) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        deletedAt: true,
        authVersion: true,
      },
    });

    if (
      !user ||
      !user.isActive ||
      user.deletedAt ||
      user.authVersion !== payload.authVersion
    ) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return {
      sub: user.id,
      role: user.role,
      authVersion: user.authVersion,
      username: user.username,
    };
  }
}
