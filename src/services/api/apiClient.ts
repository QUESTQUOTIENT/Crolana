/**
 * src/services/api/apiClient.ts
 *
 * Centralized HTTP client for all backend API calls.
 * All other API service files import from here.
 *
 * Features:
 *  - Automatic Bearer token injection from localStorage
 *  - Consistent error handling (throws ApiError with .status + .message)
 *  - JSON serialization/deserialization
 *  - Base URL defaults to same origin (works for dev + prod)
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = ''; // Same origin — Express serves both API and frontend

function getAuthHeader(): Record<string, string> {
  const token = typeof localStorage !== 'undefined'
    ? localStorage.getItem('crolana-token')
    : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = {
    ...getAuthHeader(),
    ...extraHeaders,
  };

  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body instanceof FormData
      ? body
      : body !== undefined
        ? JSON.stringify(body)
        : undefined,
  });

  // Try to parse JSON regardless of status (errors come back as JSON)
  let data: any;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const message = (typeof data === 'object' && data?.error)
      ? data.error
      : `HTTP ${res.status}`;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

export const apiClient = {
  get:    <T>(path: string)                               => request<T>('GET',    path),
  post:   <T>(path: string, body?: unknown)               => request<T>('POST',   path, body),
  put:    <T>(path: string, body?: unknown)               => request<T>('PUT',    path, body),
  delete: <T>(path: string)                               => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData)               => request<T>('POST',   path, form),
};
