import * as React from 'react';
import { api, tokenStore } from '@/lib/api';

export type Role = 'admin' | 'comercial' | 'pd' | 'compras' | 'producao';
export interface AuthUser {
  id: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  pode_ver_custos: boolean; // F5 — só UX (mostrar/esconder Matriz); autoridade é o AcessoCustoGuard
}

interface AuthContextValue {
  user: AuthUser | null;
  carregando: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [carregando, setCarregando] = React.useState(true);

  // ao montar: se ha token, valida e carrega o usuario
  React.useEffect(() => {
    let ativo = true;
    (async () => {
      if (!tokenStore.get()) {
        setCarregando(false);
        return;
      }
      try {
        const { data } = await api.get<AuthUser>('/auth/me');
        if (ativo) setUser(data);
      } catch {
        tokenStore.clear();
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const login = React.useCallback(async (email: string, senha: string) => {
    const { data } = await api.post('/auth/login', { email, senha });
    tokenStore.set(data.access_token, data.refresh_token);
    setUser(data.user as AuthUser);
  }, []);

  const logout = React.useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, carregando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
