import { Body, Controller, Post, Req, UseGuards, Get } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthGuard } from './auth.guard.js';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    async login(@Body() loginDto: LoginDto) {
        const result = await this.authService.validateUser(loginDto);
        return {
            message: 'Login successful',
            data: result,
        };
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