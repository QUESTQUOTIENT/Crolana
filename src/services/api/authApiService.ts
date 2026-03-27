/**
 * src/services/api/authApiService.ts
 * Frontend service for wallet-based authentication (SIWE flow).
 *
 * Full sign-in flow:
 *   1. authApiService.getNonce(address)          → { nonce, message }
 *   2. wallet.signMessage(message)               → signature
 *   3. authApiService.verify(address, sig, msg)  → { token }
 *   4. Save token to localStorage
 *   5. apiClient reads token automatically on all future requests
 */

import { apiClient } from './apiClient';

export interface NonceResponse {
  nonce: string;
  message: string;     // Pre-formatted SIWE message to sign
  expiresAt: number;
}

export interface AuthSession {
  token: string;
  address: string;
  chainId: number;
  expiresAt: number;
}

export interface SessionInfo {
  address: string;
  chainId: number;
  authenticated: boolean;
}

const TOKEN_KEY = 'crolana-token';

export const authApiService = {
  /** Step 1: Request a sign-in nonce for an address */
  getNonce(address: string): Promise<NonceResponse> {
    return apiClient.get(`/api/auth/nonce?address=${encodeURIComponent(address)}`);
  },

  /** Step 3: Submit signed message and get session JWT */
  verify(address: string, signature: string, message: string, chainId = 25): Promise<AuthSession> {
    return apiClient.post('/api/auth/verify', { address, signature, message, chainId });
  },

  /** Check if current stored token is valid */
  getSession(): Promise<SessionInfo> {
    return apiClient.get('/api/auth/me');
  },

  /** Sign out — removes stored token */
  async logout(): Promise<void> {
    try { await apiClient.post('/api/auth/logout'); } catch { /* ignore */ }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
    }
  },

  // ── Local token helpers ──────────────────────────────────────────────────

  saveToken(token: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, token);
    }
  },

  getToken(): string | null {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(TOKEN_KEY)
      : null;
  },

  clearToken(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
    }
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};
