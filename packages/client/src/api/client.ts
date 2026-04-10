const API_URL = (import.meta.env.VITE_API_URL as string) ?? '/api/v1';

interface ApiError {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    this.accessToken = localStorage.getItem('closerai.access');
    this.refreshToken = localStorage.getItem('closerai.refresh');
  }

  setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
    localStorage.setItem('closerai.access', access);
    localStorage.setItem('closerai.refresh', refresh);
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('closerai.access');
    localStorage.removeItem('closerai.refresh');
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    if (this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);

    const res = await fetch(`${API_URL}${path}`, { ...init, headers });

    if (res.status === 401 && retry && this.refreshToken) {
      const refreshed = await this.refresh();
      if (refreshed) return this.request<T>(path, init, false);
    }

    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: { message: 'request failed' } }))) as ApiError;
      throw new Error(err.error?.message ?? `HTTP ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async refresh(): Promise<boolean> {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (!res.ok) {
        this.clearTokens();
        return false;
      }
      const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
      this.setTokens(tokens.accessToken, tokens.refreshToken);
      return true;
    } catch {
      this.clearTokens();
      return false;
    }
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
