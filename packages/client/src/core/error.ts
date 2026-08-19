export interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

export class DreamCmsError extends Error {
  readonly status: number;
  readonly details: string[];
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const parsedBody = isApiErrorBody(body) ? body : undefined;
    const details = normalizeMessages(parsedBody?.message);

    super(details[0] ?? `Request failed with status ${status}`);

    this.name = 'DreamCmsError';
    this.status = status;
    this.details = details;
    this.body = body;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null;
}

function normalizeMessages(message: unknown): string[] {
  if (typeof message === 'string') {
    return [message];
  }

  if (Array.isArray(message)) {
    return message.filter(
      (item): item is string => typeof item === 'string',
    );
  }

  return [];
}