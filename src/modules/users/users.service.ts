import { ConflictException, Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import * as argon2 from 'argon2';
import { Prisma } from '../../generated/prisma/client.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) { }
    
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
            select: this.privateUserSelect
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

        const canViewPrivateInfo = currentUser.role === 'admin' || currentUser.sub === user.id;


        return this.prisma.user.findUnique({
            where: {
                username,
                deletedAt: null,
            },
            select: canViewPrivateInfo ? this.privateUserSelect : this.publicUserSelect
        });
    }   

    async createUser(createUserDto: CreateUserDto, currentUser?: { sub: string; role: string }) {
        const registrationMode = this.config.get<string>('REGISTRATION_MODE', 'admin_only');

        if (registrationMode === 'admin_only' && (!currentUser || currentUser.role !== 'admin')) {
            throw new ForbiddenException('Permission denied');
        }

        const { username, email, password } = createUserDto;

        if (
        createUserDto.role &&
        currentUser?.role !== 'admin'
        ) {
        throw new ForbiddenException(
            'Permission denied',
        );
        }

        // 检查用户名和邮箱是否已存在
        const existingUser = await this.prisma.user.findFirst({
            where: {
                OR: [
                    { username },
                    { email },
                ],
            },
        });

        if (existingUser) {
            if (existingUser.deletedAt) { // 如果用户已被删除，提示联系管理员恢复账号
                throw new ConflictException('User with this username or email was previously deleted, please contact support to restore your account');
            }

            throw new ConflictException('Username or email already exists');
        }

        const finalRole =
        currentUser?.role === 'admin'    // 如果是管理员且管理员提供了role，否则为user
            ? createUserDto.role ?? 'user'
            : 'user';

        const passwordHash = await argon2.hash(password);

        try {
            return await this.prisma.user.create({
                data: {
                    username,
                    email,
                    passwordHash,
                    role: finalRole,
                },
                select: this.publicUserSelect
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

    async updateUser(
        username: string, 
        updateUserDto: UpdateUserDto, 
        currentUser: { sub: string; role: string }
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
            ...(password ? { 
                passwordHash: await argon2.hash(password),
                authVersion: { 
                    increment: 1 
                }
             } : {}),
        }

        try {
            return this.prisma.user.update({
                where: {
                    username,
                    deletedAt: null,
                },
                data: data,
                select: this.publicUserSelect
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

    async deleteUser(username: string, currentUser: { sub: string; role: string; username: string }) {

        if (currentUser.role !== 'admin') // 只有管理员可以删除用户
        {
            throw new ForbiddenException('Permission denied');
        }

        if (currentUser.username === username) // 管理员不能删除自己
        {
            throw new ForbiddenException('You cannot delete yourself');
        }

        try {
            return await this.prisma.user.update({
                where: {
                    username,
                    deletedAt: null,
                },
                data: {
                    deletedAt: new Date(),
                },
                select: this.publicUserSelect
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new NotFoundException('User not found or already deleted');
            }
            throw error;
        }
    }
}