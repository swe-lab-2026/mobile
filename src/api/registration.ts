import { apiRequest } from './client';

export interface RegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface RegisterResponse {
  email: string;
  first_name: string;
  last_name: string;
  email_verified: boolean;
  code_expires_in: number;
}

export interface VerifyEmailResponse {
  email: string;
  email_verified: boolean;
}

export interface CodeTimingResponse {
  email: string;
  code_expires_in: number;
  retry_after: number;
}

export interface ResetPasswordResponse {
  email: string;
}

export const registrationApi = {
  register(body: RegisterPayload) {
    return apiRequest<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
      skipAuth: true,
    });
  },

  verify(email: string, code: string) {
    return apiRequest<VerifyEmailResponse>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
      skipAuth: true,
    });
  },

  resend(email: string) {
    return apiRequest<CodeTimingResponse>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuth: true,
    });
  },

  requestReset(email: string) {
    return apiRequest<CodeTimingResponse>('/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuth: true,
    });
  },

  reset(email: string, token: string, new_password: string) {
    return apiRequest<ResetPasswordResponse>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, token, new_password }),
      skipAuth: true,
    });
  },
};