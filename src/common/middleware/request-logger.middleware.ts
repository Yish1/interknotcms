import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const SENSITIVE_KEYS =
  /password|passcode|authorization|cookie|token|secret|api[-_]?key/i;

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLoggerMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const parameters = {
      params: this.sanitize(req.params ?? {}),
      query: this.sanitize(req.query ?? {}),
      body: this.sanitize(req.body ?? {}),
    };

    res.on('finish', () => {
      const duration = Date.now() - start;
      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms parameters=${this.stringify(parameters)}`,
      );
    });

    next();
  }

  private sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item, seen));
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        this.sanitize(item, seen),
      ]),
    );
  }

  private stringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return '"[Unserializable parameters]"';
    }
  }
}
 