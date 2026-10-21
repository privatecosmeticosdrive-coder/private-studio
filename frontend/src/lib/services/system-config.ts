import { api } from '@/lib/api';
import type { SystemConfig } from '@/lib/types';

/**
 * Campos editáveis pelo admin (subconjunto VIVO do UpdateSystemConfigDto).
 * mo_folha_mensal / mo_dias_uteis / imposto_mp_pct / imposto_mo_pct / ipi_pct
 * saíram da tela em 10/26: não alimentam o preço desde o corte F3/F4 (MO vem de
 * parametro_producao, tributos da matriz fiscal, IPI do NCM).
 */
export interface AtualizarConfigPayload {
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
