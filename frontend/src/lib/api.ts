import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const TOKEN_KEY = 'ps_token';
const REFRESH_KEY = 'ps_refresh';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh?: string) => {
    localStorage.setItem(TOKEN_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// baseURL /api e proxied para o backend pelo Vite (dev) e pelo mesmo host (prod).
export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ---- refresh single-flight: na 1a 401 tenta renovar; enfileira as demais ----
let refreshing: Promise<string | null> | null = null;

async function renovarToken(): Promise<string | null> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return null;
  try {
    const { data } = await axios.post('/api/auth/refresh', { refresh_token: refresh });
    tokenStore.set(data.access_token, data.refresh_token);
    return data.access_token as string;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const url = original?.url ?? '';
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/refresh');

    if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      refreshing = refreshing ?? renovarToken();
      const novo = await refreshing;
      refreshing = null;
      if (novo) {
        original.headers.Authorization = `Bearer ${novo}`;
        return api(original);
      }
      // refresh falhou -> sessao expirou
      tokenStore.clear();
      if (!location.pathname.startsWith('/login')) location.assign('/login');
    }
    return Promise.reject(error);
  },
);
