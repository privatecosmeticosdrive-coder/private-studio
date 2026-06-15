import { api } from '@/lib/api';
import type { SystemConfig } from '@/lib/types';

/** Campos editáveis pelo admin (espelha UpdateSystemConfigDto). */
export interface AtualizarConfigPayload {
  mo_folha_mensal?: number;
  mo_dias_uteis?: number;
  imposto_mp_pct?: number;
  imposto_mo_pct?: number;
  ipi_pct?: number;
  desvio_mp_pct?: number;
  frete_un_brl?: number;
  alerta_aumento_mp_pct?: number;
  alertas_ativos?: boolean;
}

export const systemConfigApi = {
  obter: async () => {
    const { data } = await api.get<SystemConfig>('/system-config');
    return data;
  },
  atualizar: async (payload: AtualizarConfigPayload) => {
    const { data } = await api.patch<SystemConfig>('/system-config', payload);
    return data;
  },
};
