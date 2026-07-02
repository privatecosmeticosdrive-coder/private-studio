import { api } from '@/lib/api';
import type {
  MatchResposta,
  NivelOrcamento,
  OrcamentoDetalhe,
  OrcamentoListItem,
  Paginado,
  RefinarIaResposta,
} from '@/lib/types';

export interface ListarOrcamentosParams {
  status?: string;
  cliente_id?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** Briefing do orçamento (espelha CreateOrcamentoDto). */
export interface CriarOrcamentoPayload {
  produto: string;
  cliente_id?: string;
  categoria?: string;
  nivel?: NivelOrcamento;
  volume_un?: number;
  quantidade?: number;
  margem_pct?: number;
  formula_id?: number;
  ncm_id?: number | null; // override de NCM; null limpa (volta a herdar da fórmula)
  un_min?: number;
  embalagem_id?: number;
  sem_embalagem?: boolean;
  budget_mp?: number;
  produto_referencia?: string;
  requer_amostra?: boolean;
  amostra_qtd?: number;
}

export type AtualizarOrcamentoPayload = Partial<CriarOrcamentoPayload>;

/** Inputs editáveis da Fase 1 (espelha CalcularDto). */
export interface CalcularPayload {
  un_min?: number;
  margem_pct?: number;
  cmp_base_mp_kg?: number;
}

/** Briefing mínimo do match híbrido (espelha MatchFormulasDto). */
export interface MatchFormulasPayload {
  nome_projeto?: string;
  categoria?: string;
  nivel?: NivelOrcamento;
  briefing_tecnico?: string;
  budget_mp?: number;
}

export const orcamentosApi = {
  listar: async (params: ListarOrcamentosParams) => {
    const { data } = await api.get<Paginado<OrcamentoListItem>>('/orcamentos', { params });
    return data;
  },
  obter: async (id: string) => {
    const { data } = await api.get<OrcamentoDetalhe>(`/orcamentos/${id}`);
    return data;
  },
  // PDF interno (Dia 14). Via axios (responseType blob) para carregar o Bearer —
  // um link direto nao autenticaria. Dispara o download e devolve o nome do arquivo.
  baixarPdf: async (id: string) => {
    const resp = await api.get<Blob>(`/orcamentos/${id}/pdf`, {
      responseType: 'blob',
    });
    const cd = resp.headers['content-disposition'] as string | undefined;
    const filename = cd?.match(/filename="?([^"]+)"?/)?.[1] ?? `orcamento-${id}.pdf`;
    const url = URL.createObjectURL(resp.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return filename;
  },
  criar: async (payload: CriarOrcamentoPayload) => {
    const { data } = await api.post<OrcamentoDetalhe>('/orcamentos', payload);
    return data;
  },
  atualizar: async (id: string, payload: AtualizarOrcamentoPayload) => {
    const { data } = await api.patch<OrcamentoDetalhe>(`/orcamentos/${id}`, payload);
    return data;
  },
  duplicar: async (id: string) => {
    const { data } = await api.post<OrcamentoDetalhe>(`/orcamentos/${id}/duplicar`, {});
    return data;
  },
  // Fase 1 — gera e trava o JSON_CALC. Retorna o orçamento já calculado.
  calcular: async (id: string, payload: CalcularPayload) => {
    const { data } = await api.post<OrcamentoDetalhe>(`/orcamentos/${id}/calcular`, payload);
    return data;
  },
  // Match híbrido (custo R$0) — top 10 ranqueado por score.
  matchFormulas: async (payload: MatchFormulasPayload) => {
    const { data } = await api.post<MatchResposta>('/orcamentos/match-formulas', payload);
    return data;
  },
  // Refinar com IA (opcional, ~R$0,15) — top 5 reranqueado. Mock-safe no backend.
  refinarIa: async (match_id: number) => {
    const { data } = await api.post<RefinarIaResposta>('/orcamentos/match-formulas/refinar-ia', {
      match_id,
    });
    return data;
  },
};
