import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { AccessTokenService } from './access-token.service.js';
import { RefreshTokenService } from './refresh-token.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessTokenService: AccessTokenService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async validateUser(loginDto: LoginDto) {
    const { username, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: {
        username,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (!user.isActive) {
      throw new ForbiddenException('User account is inactive');
    }

    if (user.deletedAt) {
      throw new ForbiddenException('User account has been deleted');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const profile = await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    const authenticatedUser = {
      sub: user.id,
      username: user.username,
      role: user.role,
      authVersion: user.authVersion,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.accessTokenService.create(authenticatedUser),
      this.refreshTokenService.create(user.id, user.authVersion),
    ]);

    return {
      user: profile,
      accessToken,
      refreshToken,
    };
  }

  /** 使用Refresh Token生成新的Access Token。 */
  async refresh(refreshToken: string) {
    const user = await this.refreshTokenService.authenticate(refreshToken);

    const accessToken = await this.accessTokenService.create({
      sub: user.id,
      username: user.username,
      role: user.role,
      authVersion: user.authVersion,
    });

    return {
      accessToken,
    };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        authVersion: { increment: 1 },
      },
    });

    return {
      message: 'Logout successful',
    };
  }
}
