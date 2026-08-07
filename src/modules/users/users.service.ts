import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import * as argon2 from 'argon2';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) { }
    
    private readonly selectWithoutPassword = {
        id: true,
        email: true,
        username: true,
        createdAt: true,
        avatar: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
    };

    async findAll() {
        return this.prisma.user.findMany({
            where: {
                deletedAt: null,
            },
            select: this.selectWithoutPassword
        });
    }

    async findOne(username: string) {
        return this.prisma.user.findUnique({
            where: {
                username,
                deletedAt: null,
            },
            select: this.selectWithoutPassword
        });
    }

    async createUser(createUserDto: CreateUserDto) {
        const { username, email, password } = createUserDto;

        const passwordHash = await argon2.hash(password);

        try {
            return await this.prisma.user.create({
                data: {
                    username,
                    email,
                    passwordHash,
                },
                select: this.selectWithoutPassword
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002') {
                    throw new ConflictException('Username or email already exists');
                }
            }
            throw error;
        }
    }
}