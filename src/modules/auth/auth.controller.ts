import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  Get,
  HttpCode,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import {
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
  setAccessTokenCookie,
  setAuthCookies,
} from './auth-cookie.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthGuard } from './auth.guard.js';
import { Throttle } from '@nestjs/throttler';
import { LogThrottlerGuard } from '../../common/guards/log-throttler.guard.js';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(LogThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: '用户登录',
    description:
      '验证用户名和密码，设置HttpOnly access_token和refresh_token Cookie；响应中的accessToken用于兼容Bearer客户端。',
  })
  @ApiResponse({
    status: 200,
    description: '登录成功并设置两个认证Cookie',
  })
  @ApiResponse({ status: 401, description: '用户名或密码错误' })
  @ApiResponse({ status: 403, description: '用户已禁用或删除' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true })
    response: Response,
  ) {
    const result = await this.authService.validateUser(loginDto);
    setAuthCookies(response, result.accessToken, result.refreshToken);
    return {
      message: 'Login successful',
      data: {
        user: result.user,

        // 保留给Swagger、curl和旧测试使用
        accessToken: result.accessToken,
      },
    };
  }

  @UseGuards(LogThrottlerGuard)
  @Throttle({
    default: {
      limit: 20,
      ttl: 60_000,
    },
  })
  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth('refresh-cookie')
  @ApiOperation({
    summary: '刷新Access Token',
    description:
      '使用refresh_token Cookie签发新的15分钟Access Token；不会延长Refresh Token原有的7天有效期。',
  })
  @ApiResponse({
    status: 200,
    description: '刷新成功并更新access_token Cookie',
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh Token缺失、无效、过期或用户状态不可用',
  })
  /** 使用Refresh Cookie签发新的Access Token。 */
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true })
    response: Response,
  ) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];

    if (typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Refresh token is required');
    }

    const result = await this.authService.refresh(refreshToken);

    setAccessTokenCookie(response, result.accessToken);

    return {
      message: 'Access token refreshed successfully',
      data: {
        accessToken: result.accessToken,
      },
    };
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @ApiCookieAuth('access-cookie')
  @Post('logout')
  @ApiOperation({
    summary: '用户注销',
    description:
      '支持Bearer或access_token Cookie认证；增加authVersion并清除两个认证Cookie。',
  })
  @ApiResponse({ status: 201, description: '注销成功' })
  @ApiResponse({ status: 401, description: 'Access Token缺失或无效' })
  /** 注销用户并清除认证Cookie。 */
  async logout(
    @Req() request: any,
    @Res({ passthrough: true })
    response: Response,
  ) {
    const result = await this.authService.logout(request.user.sub);

    clearAuthCookies(response);

    return result;
  }

  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @ApiCookieAuth('access-cookie')
  @Get('me')
  @ApiOperation({
    summary: '获取当前登录用户',
    description: '支持Bearer或access_token Cookie认证。',
  })
  @ApiResponse({ status: 200, description: '获取当前用户成功' })
  @ApiResponse({ status: 401, description: 'Access Token缺失或无效' })
  async me(@Req() request: any) {
    return {
      message: 'Profile retrieved successfully',
      data: request.user,
    };
  }
}
