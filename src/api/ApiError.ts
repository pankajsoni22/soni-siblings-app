import type { ApiErrorCode } from './types.ts';

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }

  static is(err: unknown, code?: ApiErrorCode): err is ApiError {
    return err instanceof ApiError && (code === undefined || err.code === code);
  }
}
