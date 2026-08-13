import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessTokenService } from './access-token.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly accessTokenService: AccessTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const token = this.accessTokenService.extractBearerToken(
      request.headers.authorization,
    );

    if (!token) {
      throw new UnauthorizedException('Token not found');
    }

    request.user = await this.accessTokenService.authenticate(token);

    return true;
  }
}
