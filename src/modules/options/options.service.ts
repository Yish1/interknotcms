import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { JsonValue } from './dto/options.dto.js';

type CurrentUser = { sub: string; role: string };

@Injectable()
export class OptionsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(currentUser: CurrentUser | undefined): void {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }
  }

  async getOption(key: string, currentUser: CurrentUser) {
    this.assertAdmin(currentUser);

    const option = await this.prisma.option.findUnique({
      where: { key },
    });

    if (!option) {
      throw new NotFoundException(`Option with key "${key}" not found`);
    }

    return option;
  }

  async setOption(
    key: string,
    value: JsonValue | undefined,
    currentUser: CurrentUser,
  ) {
    this.assertAdmin(currentUser);

    if (value === undefined) {
      throw new BadRequestException('Option value is required');
    }

    const jsonValue =
      value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

    return this.prisma.option.upsert({
      where: { key },
      update: { value: jsonValue },
      create: { key, value: jsonValue },
    });
  }

  async deleteOption(key: string, currentUser: CurrentUser) {
    this.assertAdmin(currentUser);

    try {
      const option = await this.prisma.option.delete({
        where: { key },
      });
      return option;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Option with key "${key}" not found`);
        }
      }
      throw error;
    }
  }

  async getAllOptions(currentUser: CurrentUser) {
    this.assertAdmin(currentUser);

    return this.prisma.option.findMany({
      orderBy: { key: 'asc' },
    });
  }
}
