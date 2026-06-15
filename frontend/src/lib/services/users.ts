import { api } from '@/lib/api';
import type { Role } from '@/auth/auth-context';
import type { Usuario } from '@/lib/types';

export interface CriarUsuarioPayload {
  email: string;
  nome: string;
  senha: string;
  role: Role;
}

export interface AtualizarUsuarioPayload {
  nome?: string;
  senha?: string;
  role?: Role;
  ativo?: boolean;
}

export const usersApi = {
  listar: async () => {
    const { data } = await api.get<Usuario[]>('/users');
    return data;
  },
  criar: async (payload: CriarUsuarioPayload) => {
    const { data } = await api.post<Usuario>('/users', payload);
    return data;
  },
  atualizar: async (id: string, payload: AtualizarUsuarioPayload) => {
    const { data } = await api.patch<Usuario>(`/users/${id}`, payload);
    return data;
  },
  // DELETE = desativar (ativo=false). Reativar é PATCH { ativo: true }.
  desativar: async (id: string) => {
    const { data } = await api.delete<Usuario>(`/users/${id}`);
    return data;
  },
  reativar: async (id: string) => {
    const { data } = await api.patch<Usuario>(`/users/${id}`, { ativo: true });
    return data;
  },
};
