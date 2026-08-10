import { Body, Controller, Get, Param, Post, Patch, Delete } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    async findAll() {
        const users = await this.usersService.findAll();

        return {
            data: users,
        };
    }

    @Get(':username')
    async findOne(@Param('username') username: string) {
        const user = await this.usersService.findOne(username);
        return {
            message: 'User retrieved successfully',
            data: user,
        };
    }

    @Post()
    async create(@Body() createUserDto: CreateUserDto) {
        const user = await this.usersService.createUser(createUserDto);

        return {
            message: 'User created successfully',
            data: user,
        };
    }
    
    @Patch(':username')
    async update(@Param('username') username: string, @Body() updateUserDto: UpdateUserDto) {
        const user = await this.usersService.updateUser(username, updateUserDto);

        return {
            message: 'User updated successfully',
            data: user,
        };
    }

    @Delete(':username')
    async delete(@Param('username') username: string) {
        const user = await this.usersService.deleteUser(username);

        return {
            message: 'User deleted successfully',
            data: user,
        };
    }
}