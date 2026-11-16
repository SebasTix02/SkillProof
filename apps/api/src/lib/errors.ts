export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string) => new HttpError(400, code, message);
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Sign in to continue.');
export const forbidden = (message = 'You do not have access to this.') => new HttpError(403, 'forbidden', message);
export const notFound = (what = 'Not found') => new HttpError(404, 'not_found', what);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
export const tooMany = (message: string) => new HttpError(429, 'too_many_requests', message);
