import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service.js';

interface AccessTokenPayload {
  sub: string;
  authVersion: number;
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

  async authenticate(token: string): Promise<AuthenticatedUser> {
    let payload: AccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (
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
