import { api } from '@/lib/api';
import type { PendenciaLab, CriarPendenciaPayload, IndicadoresLab } from '@/lib/types';

/**
 * Jornada de Laboratório (fatia 1). Criar/listar = qualquer autenticado (fila
 * pública, D1). Atender/concluir = pd|admin (o backend rejeita com 403).
 */
export const pendenciasLabApi = {
  listar: async (status?: string) => {
    const { data } = await api.get<PendenciaLab[]>('/pendencias-lab', {
      params: status ? { status } : undefined,
    });
    return data;
  },
  contagem: async () => {
    const { data } = await api.get<{ total: number }>('/pendencias-lab/contagem');
    return data.total;
  },
  // FASE 4 — indicadores operacionais (atrasadas / por status / tempos por urgência).
  indicadores: async () => {
    const { data } = await api.get<IndicadoresLab>('/pendencias-lab/indicadores');
    return data;
  },
  criar: async (payload: CriarPendenciaPayload) => {
    const { data } = await api.post<PendenciaLab>('/pendencias-lab', payload);
    return data;
  },
  // Fase 2 (gatilho c) — melhoria proativa: cria + assume + versiona (pd|admin).
  revisaoProativa: async (payload: {
    formula_base_id: number;
    urgencia: string;
    descricao: string;
  }) => {
    const { data } = await api.post<PendenciaLab>('/pendencias-lab/revisao-proativa', payload);
    return data;
  },
  atender: async (id: number) => {
    const { data } = await api.post<PendenciaLab>(`/pendencias-lab/${id}/atender`, {});
    return data;
  },
  // Correção A: conclui a fórmula VINCULADA (do atender) — sem id arbitrário.
  concluir: async (id: number) => {
    const { data } = await api.post<PendenciaLab>(`/pendencias-lab/${id}/concluir`, {});
    return data;
  },
};
