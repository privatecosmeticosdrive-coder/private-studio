import { api } from '@/lib/api';
import type { Cliente, ClienteDetalhe } from '@/lib/types';

export interface ClientePayload {
  nome: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
  observacoes?: string;
  // F4 Fase A (D3) — perfil fiscal (opcional; ausente = conservador)
  regime_fiscal?: string;
  finalidade_padrao?: string;
  uf?: string;
  contribuinte_icms?: boolean;
}

export const clientesApi = {
  // Backend retorna array puro (sem paginacao) — filtro/paginacao no client.
  listar: async (q?: string) => {
    const { data } = await api.get<Cliente[]>('/clientes', { params: q ? { q } : undefined });
    return data;
  },
  obter: async (id: string) => {
    const { data } = await api.get<ClienteDetalhe>(`/clientes/${id}`);
    return data;
  },
  criar: async (payload: ClientePayload) => {
    const { data } = await api.post<Cliente>('/clientes', payload);
    return data;
  },
  atualizar: async (id: string, payload: Partial<ClientePayload>) => {
    const { data } = await api.patch<Cliente>(`/clientes/${id}`, payload);
    return data;
  },
  remover: async (id: string) => {
    await api.delete(`/clientes/${id}`);
  },
};
