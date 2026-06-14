import { api } from '@/lib/api';
import type {
  Embalagem,
  EmbHistoricoPreco,
  OrcamentoResumo,
  Paginado,
  TipoEmbalagem,
} from '@/lib/types';

export interface ListarEmbParams {
  q?: string;
  tipo?: string;
  fornecedor?: string;
  material?: string;
  sem_cotacao?: boolean;
  ativo?: boolean;
  page?: number;
  pageSize?: number;
}

export interface EmbalagemPayload {
  codigo?: string;
  nome: string;
  tipo: TipoEmbalagem;
  volume_ml?: number;
  material?: string;
  cor?: string;
  preco_un_brl?: number;
  fornecedor?: string;
  prazo_entrega?: string;
  preco_estimado?: boolean;
  data_cotacao?: string;
  observacoes?: string;
}

export interface AtualizarPrecoEmbPayload {
  preco_un_brl: number;
  fornecedor?: string;
  data_cotacao: string;
  fonte_info?: string;
  observacoes?: string;
}

export const embalagensApi = {
  listar: async (params: ListarEmbParams) => {
    const { data } = await api.get<Paginado<Embalagem>>('/embalagens', { params });
    return data;
  },
  obter: async (id: number) => {
    const { data } = await api.get<Embalagem>(`/embalagens/${id}`);
    return data;
  },
  historico: async (id: number) => {
    const { data } = await api.get<EmbHistoricoPreco[]>(`/embalagens/${id}/historico`);
    return data;
  },
  orcamentos: async (id: number) => {
    const { data } = await api.get<OrcamentoResumo[]>(`/embalagens/${id}/orcamentos`);
    return data;
  },
  criar: async (payload: EmbalagemPayload) => {
    const { data } = await api.post<Embalagem>('/embalagens', payload);
    return data;
  },
  atualizar: async (id: number, payload: Partial<EmbalagemPayload>) => {
    const { data } = await api.patch<Embalagem>(`/embalagens/${id}`, payload);
    return data;
  },
  atualizarPreco: async (id: number, payload: AtualizarPrecoEmbPayload) => {
    const { data } = await api.post(`/embalagens/${id}/atualizar-preco`, payload);
    return data as { embalagem: Embalagem; variacao_pct: number | null };
  },
};
