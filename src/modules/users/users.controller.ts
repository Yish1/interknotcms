import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { OptionalAuthGuard } from '../auth/optional-auth.guard.js';
import { Throttle } from '@nestjs/throttler';
import { LogThrottlerGuard } from '../../common/guards/log-throttler.guard.js';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  async findAll(@Req() req: any) {
    const users = await this.usersService.findAll(req.user);

    return {
      data: users,
    };
  }

  @Get(':username')
  @UseGuards(AuthGuard, LogThrottlerGuard)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async findOne(@Param('username') username: string, @Req() req: any) {
    const user = await this.usersService.findOne(username, req.user);
    return {
      message: 'User retrieved successfully',
      data: user,
    };
  }

  @Post()
  @UseGuards(OptionalAuthGuard)
  @ApiBearerAuth('access-token')
  async create(@Body() createUserDto: CreateUserDto, @Req() req: any) {
    const user = await this.usersService.createUser(createUserDto, req.user);

    return {
      message: 'User created successfully',
      data: user,
    };
  }

  @Patch(':username')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  async update(
    @Param('username') username: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: any,
  ) {
    const user = await this.usersService.updateUser(
      username,
      updateUserDto,
      req.user,
    );

    return {
      message: 'User updated successfully',
      data: user,
    };
  }

  @Delete(':username')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  async delete(@Param('username') username: string, @Req() req: any) {
    const user = await this.usersService.deleteUser(username, req.user);

    return {
      message: 'User deleted successfully',
      data: user,
    };
  }

  @Post(':username/disable')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  async disable(@Param('username') username: string, @Req() req: any) {
    const user = await this.usersService.disableUser(username, req.user);

    return {
      message: 'User disabled successfully',
      data: user,
    };
  }

  @Post(':username/enable')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  async enable(@Param('username') username: string, @Req() req: any) {
    const user = await this.usersService.enableUser(username, req.user);

    return {
      message: 'User enabled successfully',
      data: user,
    };
  }

  @Post(':username/restore')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  async restore(@Param('username') username: string, @Req() req: any) {
    const user = await this.usersService.restoreUser(username, req.user);

    return {
      message: 'User restored successfully',
      data: user,
    };
  }
}
