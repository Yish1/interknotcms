import { Body, Controller, Get, Param, Post, Patch, Delete, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { OptionalAuthGuard } from '../auth/optional-auth.guard.js';
import { Throttle } from '@nestjs/throttler';
import { LogThrottlerGuard } from '../../common/guards/log-throttler.guard.js';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    @UseGuards(AuthGuard)
    async findAll(@Req() req: any) {
        const users = await this.usersService.findAll(req.user);

        return {
            data: users,
        };
    }

    @Get(':username')
    @UseGuards(AuthGuard, LogThrottlerGuard)
    @Throttle({default: {limit: 5, ttl: 60_000}})
    async findOne(@Param('username') username: string, @Req() req: any) {
        const user = await this.usersService.findOne(username, req.user);
        return {
            message: 'User retrieved successfully',
            data: user,
        };
    }

    @Post()
    @UseGuards(OptionalAuthGuard)
    async create(@Body() createUserDto: CreateUserDto, @Req() req: any) {
        const user = await this.usersService.createUser(createUserDto, req.user);

        return {
            message: 'User created successfully',
            data: user,
        };
    }
    
    @Patch(':username')
    @UseGuards(AuthGuard)
    async update(
        @Param('username') username: string, 
        @Body() updateUserDto: UpdateUserDto,
        @Req() req: any,
    ) {

        const user = await this.usersService.updateUser(username, updateUserDto, req.user);

        return {
            message: 'User updated successfully',
            data: user,
        };
    }

    @Delete(':username')
    @UseGuards(AuthGuard)
    async delete(@Param('username') username: string, @Req() req: any) {
        const user = await this.usersService.deleteUser(username, req.user);

        return {
            message: 'User deleted successfully',
            data: user,
        };
    }
}