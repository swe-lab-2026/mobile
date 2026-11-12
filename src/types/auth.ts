export type GlobalRole = 'USER' | 'PLATFORM_ADMIN';

export type AccountStatus = 'ACTIVE' | 'BLOCKED' | 'DELETED';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface TokenResponseDto {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserResponseDto {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  global_role: GlobalRole;
  status: AccountStatus;
  email_verified_at: string | null;
  created_at: string;
}

export interface AuthUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  globalRole: GlobalRole;
  status: AccountStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
}
