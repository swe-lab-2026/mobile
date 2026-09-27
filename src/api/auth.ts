import { LoginCredentials, LoginResponse } from '../types/auth';

// TEMP: fake data for testing
export function login(credentials: LoginCredentials): Promise<LoginResponse> {
  return Promise.resolve({
    token: 'fake',
    user: {
      id: '1',
      name: 'Test admin',
      email: credentials.email,
      role: 'event_admin',
    },
  });
}

export function logout(): Promise<void> {
  return Promise.resolve();
}