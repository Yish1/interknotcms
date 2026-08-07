import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';

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
            data: user,
        };
    }

    @Post()
    async create(@Body() createUserDto: CreateUserDto) {
        const user = await this.usersService.createUser(createUserDto);

        return {
            data: user,
        };
    }
}