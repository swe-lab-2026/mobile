import { apiRequest } from "./client";
import { LoginCredentials, TokenResponse } from "../types/auth";

export const login = (c: LoginCredentials) => 
  apiRequest<TokenResponse> ('/auth/login', { 
    method: 'POST', body: JSON.stringify(c), skipAuth: true
  });

export const refresh = (refreshToken: string) => 
  apiRequest<TokenResponse> ('/auth/refresh', {
    method: 'POST', body: JSON.stringify({refresh_token: refreshToken}), skipAuth: true
  });

export const logout = (refreshToken: string) => 
  apiRequest<void> ('/auth/logout', {
    method: 'POST', body: JSON.stringify({refresh_token: refreshToken}), skipAuth: true
  }).catch(() => undefined);