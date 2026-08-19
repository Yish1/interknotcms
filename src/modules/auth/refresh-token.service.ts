import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';

interface RefreshTokenPayload {
  sub: string; // 用户 ID
  authVersion: number;
  type: 'refresh';
}

interface RefreshAuthenticatedUser {
  id: string;
  username: string;
  role: 'admin' | 'editor' | 'user';
  authVersion: number;
}

@Injectable()
export class RefreshTokenService {
  private readonly secret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.secret = this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  /**登录成功时调用，创建一个7天有效期的Refresh Token */
  async create(userId: string, authVersion: number): Promise<string> {
    const payload: RefreshTokenPayload = {
      sub: userId,
      authVersion,
      type: 'refresh',
    };

    return this.jwtService.signAsync(payload, {
      secret: this.secret,
      expiresIn: '7d',
    });
  }

  /**验证Refresh Token的有效性，并返回对应的用户信息 */
  async authenticate(token: string): Promise<RefreshAuthenticatedUser> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.secret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (
      payload.type !== 'refresh' ||
      typeof payload.sub !== 'string' ||
      !isUUID(payload.sub) ||
      !Number.isInteger(payload.authVersion)
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
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
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      authVersion: user.authVersion,
    };
  }
}
