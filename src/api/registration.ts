import { apiRequest } from './client';

export function registerUser(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) {
  return apiRequest<unknown>('/auth/register', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      first_name: input.firstName,
      last_name: input.lastName,
    }),
  });
}

export function verifyEmail(email: string, code: string) {
  return apiRequest<unknown>('/auth/verify-email', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ email, code }),
  });
}

export function resendVerification(email: string) {
  return apiRequest<unknown>('/auth/resend-verification', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ email }),
  });
}