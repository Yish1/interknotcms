import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessTokenService } from './access-token.service.js';
import { ACCESS_TOKEN_COOKIE } from './auth-cookie.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly accessTokenService: AccessTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const token = this.accessTokenService.extractToken(
      request.headers.authorization,
      request.cookies?.[ACCESS_TOKEN_COOKIE],
    );

    if (!token) {
      throw new UnauthorizedException('Permission denied');
    }

    request.user = await this.accessTokenService.authenticate(token);

    return true;
  }
}
