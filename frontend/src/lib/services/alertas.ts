import { api } from '@/lib/api';
import type { Alerta } from '@/lib/types';

export interface ListarAlertasParams {
  lido?: boolean;
  resolvido?: boolean;
}

export const alertasApi = {
  listar: async (params: ListarAlertasParams = {}) => {
    const { data } = await api.get<Alerta[]>('/alertas', { params });
    return data;
  },
  marcarLido: async (id: number) => {
    const { data } = await api.patch<Alerta>(`/alertas/${id}/marcar-lido`, {});
    return data;
  },
  resolver: async (id: number) => {
    const { data } = await api.patch<Alerta>(`/alertas/${id}/resolver`, {});
    return data;
  },
};
