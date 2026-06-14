import { api } from '@/lib/api';
import type {
  FormulaBuscaItem,
  FormulaDetalhe,
  FormulaListItem,
  Paginado,
  VersoesResposta,
} from '@/lib/types';

export interface ListarFormulasParams {
  q?: string;
  categoria?: string;
  origem?: string;
  status?: string;
  cliente_id?: string;
  maes?: boolean;
  page?: number;
  pageSize?: number;
}

export const formulasApi = {
  listar: async (params: ListarFormulasParams) => {
    const { data } = await api.get<Paginado<FormulaListItem>>('/formulas', { params });
    return data;
  },
  // Busca GIN/full-text (GET /formulas/buscar?q=)
  buscar: async (q: string) => {
    const { data } = await api.get<FormulaBuscaItem[]>('/formulas/buscar', { params: { q } });
    return data;
  },
  obter: async (id: number) => {
    const { data } = await api.get<FormulaDetalhe>(`/formulas/${id}`);
    return data;
  },
  versoes: async (id: number) => {
    const { data } = await api.get<VersoesResposta>(`/formulas/${id}/versoes`);
    return data;
  },
};
