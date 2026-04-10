import { create } from 'zustand';
import { api } from '../api/client';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  loadCurrentUser: () => Promise<void>;
  logout: () => void;
}

interface RegisterInput {
  organizationName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  website?: string;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,

  async login(email, password) {
    set({ loading: true, error: null });
    try {
      const tokens = await api.post<{ accessToken: string; refreshToken: string }>('/auth/login', {
        email,
        password,
      });
      api.setTokens(tokens.accessToken, tokens.refreshToken);
      const user = await api.get<User>('/users/me');
      set({ user, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Login failed', loading: false });
      throw err;
    }
  },

  async register(input) {
    set({ loading: true, error: null });
    try {
      const tokens = await api.post<{ accessToken: string; refreshToken: string }>(
        '/auth/register',
        input,
      );
      api.setTokens(tokens.accessToken, tokens.refreshToken);
      const user = await api.get<User>('/users/me');
      set({ user, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Register failed', loading: false });
      throw err;
    }
  },

  async loadCurrentUser() {
    if (!api.isAuthenticated()) return;
    try {
      const user = await api.get<User>('/users/me');
      set({ user });
    } catch {
      api.clearTokens();
      set({ user: null });
    }
  },

  logout() {
    api.clearTokens();
    set({ user: null });
  },
}));
