import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class LogThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger('Throttler');

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest();

    this.logger.warn(
    `Rate limit exceeded: IP=${request.ip} ${request.method} ${request.originalUrl} limit=${throttlerLimitDetail.limit} ttl=${throttlerLimitDetail.ttl}ms`,
    );

    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}