import { api } from '@/lib/api';
import type {
  FormulaQueUsa,
  MateriaPrima,
  MpHistoricoPreco,
  Paginado,
  PontoHistorico,
} from '@/lib/types';

export interface ListarMpParams {
  q?: string;
  fornecedor?: string;
  vencidas?: boolean;
  page?: number;
  pageSize?: number;
}

export interface MpPayload {
  codigo: number;
  nome: string;
  preco_kg_brl?: number;
  fornecedor?: string;
  embalagem_minima?: string;
  data_cotacao?: string;
  validade_cotacao?: string;
  observacoes?: string;
}

export interface AtualizarPrecoMpPayload {
  preco_kg_brl: number;
  fornecedor: string;
  data_cotacao: string;
  fonte_info: string;
  observacoes?: string;
}

export const mpsApi = {
  listar: async (params: ListarMpParams) => {
    const { data } = await api.get<Paginado<MateriaPrima>>('/mps', { params });
    return data;
  },
  obter: async (codigo: number) => {
    const { data } = await api.get<MateriaPrima>(`/mps/${codigo}`);
    return data;
  },
  formulas: async (codigo: number) => {
    const { data } = await api.get<FormulaQueUsa[]>(`/mps/${codigo}/formulas`);
    return data;
  },
  historico: async (codigo: number) => {
    const { data } = await api.get<MpHistoricoPreco[]>(`/mps/${codigo}/historico`);
    return data;
  },
  historicoGrafico: async (codigo: number) => {
    const { data } = await api.get<PontoHistorico[]>(`/mps/${codigo}/historico/grafico`);
    return data;
  },
  criar: async (payload: MpPayload) => {
    const { data } = await api.post<MateriaPrima>('/mps', payload);
    return data;
  },
  atualizar: async (codigo: number, payload: Partial<Omit<MpPayload, 'codigo'>>) => {
    const { data } = await api.patch<MateriaPrima>(`/mps/${codigo}`, payload);
    return data;
  },
  atualizarPreco: async (codigo: number, payload: AtualizarPrecoMpPayload) => {
    const { data } = await api.post(`/mps/${codigo}/atualizar-preco`, payload);
    return data as { mp: MateriaPrima; variacao_pct: number | null; gerou_alerta: boolean };
  },
};
