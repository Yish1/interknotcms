import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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

    const { passwordHash, ...userWithoutPassword } = user;

    const payload = { 
        sub: user.id, 
        username: user.username, 
        role: user.role,
        authVersion: user.authVersion,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      user: userWithoutPassword,
      accessToken,
    };
  }
}
