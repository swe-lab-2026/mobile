// TODO: implement the apiRequest once the backend is up

export function setAuthToken(token: string | null) {}

export function setUnauthorizedHandler(handler: (() => void) | null) {}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, options?: any): Promise<T> {
  throw new Error('apiRequest not implemented yet');
}