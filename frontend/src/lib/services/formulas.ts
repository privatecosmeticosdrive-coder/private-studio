import { api } from '@/lib/api';
import type {
  ComposicaoItemInput,
  FormulaBuscaItem,
  FormulaDetalhe,
  FormulaListItem,
  FormulaPendenteNcm,
  NovaVersaoPayload,
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

export interface RevisarNcmPayload {
  ncm_id?: number; // se ausente, confirma o NCM atual; se presente, troca
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
  // Cria nova versão (rascunho) na árvore da fórmula-mãe com a composição editada.
  novaVersao: async (id: number, payload: NovaVersaoPayload) => {
    const { data } = await api.post<FormulaDetalhe>(`/formulas/${id}/nova-versao`, payload);
    return data;
  },
  // P0-1: edição IN-PLACE do RASCUNHO (mesma versão; validada é imutável — 400).
  // Save parcial: o backend NÃO exige soma na faixa aqui (só na validação).
  atualizar: async (
    id: number,
    payload: { versao_descricao?: string; composicao?: ComposicaoItemInput[] },
  ) => {
    const { data } = await api.patch<FormulaDetalhe>(`/formulas/${id}`, payload);
    return data;
  },
  // Valida a fórmula (rascunho -> validada). Backend: @Roles(admin, pd) — D3.
  validar: async (id: number, observacoes?: string) => {
    const { data } = await api.post<FormulaDetalhe>(`/formulas/${id}/validar`, {
      observacoes,
    });
    return data;
  },
  // Fila de revisão da associação fórmula->NCM (F5 Bloco C).
  listarPendentesNcm: async (params: { q?: string; page?: number; pageSize?: number }) => {
    const { data } = await api.get<Paginado<FormulaPendenteNcm>>('/formulas/pendentes-ncm', { params });
    return data;
  },
  // Confirma (sem ncm_id) ou troca (com ncm_id) + carimbo; retorna a fórmula atualizada.
  revisarNcm: async (id: number, payload: RevisarNcmPayload) => {
    const { data } = await api.patch<FormulaDetalhe>(`/formulas/${id}/revisar-ncm`, payload);
    return data;
  },
};
