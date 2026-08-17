import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import * as argon2 from 'argon2';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly privateUserSelect = {
    id: true,
    email: true,
    username: true,
    createdAt: true,
    avatar: true,
    role: true,
    isActive: true,
    lastLoginAt: true,
    phone: true,
  };

  private readonly publicUserSelect = {
    username: true,
    avatar: true,
    role: true,
    email: true,
    lastLoginAt: true,
  };

  async findAll(currentUser: { sub: string; role: string }) {
    if (currentUser.role !== 'admin') {
      throw new ForbiddenException('Permission denied');
    }

    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
      },
      select: this.privateUserSelect,
    });
  }

  async findOne(username: string, currentUser: { sub: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: {
        username,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const canViewPrivateInfo =
      currentUser.role === 'admin' || currentUser.sub === user.id;

    return this.prisma.user.findUnique({
      where: {
        username,
        deletedAt: null,
      },
      select: canViewPrivateInfo
        ? this.privateUserSelect
        : this.publicUserSelect,
    });
  }

  async createUser(
    createUserDto: CreateUserDto,
    currentUser?: { sub: string; role: string },
  ) {
    const registrationOption = await this.prisma.option.findUnique({
      where: { key: 'registration_mode' },
      select: { value: true },
    });

    // 配置缺失或值不合法时采用更安全的 ADMIN_ONLY 模式。
    const registrationMode =
      registrationOption?.value === 'OPEN' ? 'OPEN' : 'ADMIN_ONLY';

    if (
      registrationMode !== 'OPEN' &&
      (!currentUser || currentUser.role !== 'admin')
    ) {
      throw new ForbiddenException('Permission denied');
    }

    const { username, email, password, phone } = createUserDto;

    if (createUserDto.role && currentUser?.role !== 'admin') {
      throw new ForbiddenException('Permission denied');
    }

    // 检查用户名、邮箱或手机号是否已存在
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }, ...(phone ? [{ phone }] : [])],
      },
    });

    if (existingUser) {
      if (existingUser.deletedAt) {
        // 如果用户已被删除，提示联系管理员恢复账号
        throw new ConflictException(
          'User with this username, email, or phone was previously deleted, please contact support to restore your account',
        );
      }

      throw new ConflictException('Username, email, or phone already exists');
    }

    const finalRole =
      currentUser?.role === 'admin' // 如果是管理员且管理员提供了role，否则为user
        ? (createUserDto.role ?? 'user')
        : 'user';

    const passwordHash = await argon2.hash(password);

    try {
      return await this.prisma.user.create({
        data: {
          username,
          email,
          phone,
          passwordHash,
          role: finalRole,
        },
        select: this.publicUserSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Username, email, or phone already exists',
          );
        }
      }
      throw error;
    }
  }

  async updateUser(
    username: string,
    updateUserDto: UpdateUserDto,
    currentUser: { sub: string; role: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: {
        username,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isSelf = currentUser.sub === user.id;

    if (currentUser.role !== 'admin' && !isSelf) {
      throw new ForbiddenException('Permission denied');
    }

    const { password, oldPassword, ...rest } = updateUserDto;

    // 修改自己密码时，必须验证旧密码
    if (isSelf && password) {
      if (!oldPassword) {
        throw new BadRequestException('Old password is required');
      }

      const passwordValid = await argon2.verify(user.passwordHash, oldPassword);

      if (!passwordValid) {
        throw new BadRequestException('Invalid old password');
      }
    }

    const data = {
      ...rest,
      ...(password
        ? {
            passwordHash: await argon2.hash(password),
            authVersion: {
              increment: 1,
            },
          }
        : {}),
    };

    try {
      return this.prisma.user.update({
        where: {
          username,
          deletedAt: null,
        },
        data: data,
        select: this.publicUserSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Username, email, or phone already exists',
          );
        }
      }
      throw error;
    }
  }

  async deleteUser(
    username: string,
    currentUser: { sub: string; role: string; username: string },
  ) {
    if (currentUser.role !== 'admin') // 只有管理员可以删除用户
    {
      throw new ForbiddenException('Permission denied');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        username,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found or already deleted');
    }

    if (currentUser.sub === user?.id) // 管理员不能删除自己
    {
      throw new ForbiddenException('You cannot delete yourself');
    }

    return await this.prisma.user.update({
      where: {
        username,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        authVersion: { increment: 1 }, // 删除用户时增加authVersion，使其所有现有token失效
      },
      select: {
        ...this.publicUserSelect,
        deletedAt: true,
      },
    });
  }

  async restoreUser(
    username: string,
    currentUser: { sub: string; role: string; username: string },
  ) {
    if (currentUser.role !== 'admin')
    // 只有管理员可以恢复用户
    {
      throw new ForbiddenException('Permission denied');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        username,
        deletedAt: { not: null },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found or not disabled');
    }

    return await this.prisma.user.update({
      where: {
        username,
      },
      data: {
        deletedAt: null,
        authVersion: { increment: 1 }, // 恢复用户时增加authVersion，使其所有现有token失效
      },
      select: {
        ...this.publicUserSelect,
        deletedAt: true,
      },
    });
  }

  async disableUser(
    username: string,
    currentUser: { sub: string; role: string; username: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: {
        username,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (currentUser.role !== 'admin' || currentUser.sub === user?.id) {
      throw new ForbiddenException('Permission denied');
    }

    if (!user) {
      throw new NotFoundException('User not found or already disabled');
    }

    return await this.prisma.user.update({
      where: {
        username,
      },
      data: {
        isActive: false,
        authVersion: { increment: 1 }, // 禁用用户时增加authVersion，使其所有现有token失效
      },
      select: {
        ...this.publicUserSelect,
        isActive: true,
      },
    });
  }

  async enableUser(
    username: string,
    currentUser: { sub: string; role: string; username: string },
  ) {
    if (currentUser.role !== 'admin') {
      throw new ForbiddenException('Permission denied');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        username,
        deletedAt: null,
        isActive: false,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found or already enabled');
    }

    return await this.prisma.user.update({
      where: {
        username,
      },
      data: {
        isActive: true,
        authVersion: { increment: 1 }, // 启用用户时增加authVersion，使其所有现有token失效
      },
      select: {
        ...this.publicUserSelect,
        isActive: true,
      },
    });
  }
}
