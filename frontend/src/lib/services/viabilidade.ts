import { api } from '@/lib/api';
import type {
  ContextoViabilidade,
  PremissasViabilidade,
  ProjetoViabilidade,
  ProjetoViabilidadeLista,
  ResultadoViabilidade,
  SalvarProjetoPayload,
} from '@/lib/viabilidade-types';

/**
 * Análise de viabilidade de projetos. Acesso no backend: admin OU
 * pode_ver_custos (AcessoCustoGuard). DELETE é só admin (403 para os demais).
 */
export const viabilidadeApi = {
  listar: async () => {
    const { data } = await api.get<ProjetoViabilidadeLista[]>('/viabilidade');
    return data;
  },
  /** parâmetros vigentes (ou `erro` em texto) + NCMs ativas + clientes com perfil. */
  contexto: async () => {
    const { data } = await api.get<ContextoViabilidade>('/viabilidade/contexto');
    return data;
  },
  /** só calcula — não grava. */
  calcular: async (premissas: PremissasViabilidade) => {
    const { data } = await api.post<ResultadoViabilidade>('/viabilidade/calcular', { premissas });
    return data;
  },
  criar: async (payload: SalvarProjetoPayload) => {
    const { data } = await api.post<ProjetoViabilidade>('/viabilidade', payload);
    return data;
  },
  obter: async (id: number) => {
    const { data } = await api.get<ProjetoViabilidade>(`/viabilidade/${id}`);
    return data;
  },
  atualizar: async (id: number, payload: Partial<SalvarProjetoPayload>) => {
    const { data } = await api.patch<ProjetoViabilidade>(`/viabilidade/${id}`, payload);
    return data;
  },
  /** recalcula com as premissas gravadas e a vigência de hoje. */
  recalcular: async (id: number) => {
    const { data } = await api.post<ProjetoViabilidade>(`/viabilidade/${id}/calcular`);
    return data;
  },
  remover: async (id: number) => {
    await api.delete(`/viabilidade/${id}`);
  },
};
