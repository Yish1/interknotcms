import { Body, Controller, Post, Req, UseGuards, Get, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthGuard } from './auth.guard.js';
import { Throttle } from '@nestjs/throttler';
import { LogThrottlerGuard } from '../../common/guards/log-throttler.guard.js';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @UseGuards(LogThrottlerGuard)
    @Throttle({default: {limit: 5, ttl: 60_000}})
    @Post('login')
    @HttpCode(200)
    async login(@Body() loginDto: LoginDto) {
        const result = await this.authService.validateUser(loginDto);
        return {
            message: 'Login successful',
            data: result,
        };
    }

    @UseGuards(AuthGuard)
    @Post('logout')
    async logout(@Req() request: any) {
        return this.authService.logout(request.user.sub);
    }

    @UseGuards(AuthGuard)
    @Get('me')
    async me(@Req() request: any) {
        return {
            message: 'Profile retrieved successfully',
            data: request.user,
        };
    }
}