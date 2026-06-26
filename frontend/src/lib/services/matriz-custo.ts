import { api } from '@/lib/api';
import type {
  MatrizCustoView,
  UpdateOperacionalPayload,
  UpdateFiscalPayload,
} from '@/lib/types';

/**
 * Matriz de Custo (F5). Acesso no backend: admin OU pode_ver_custos
 * (AcessoCustoGuard). Os dois PATCH retornam o montarView completo, então a
 * mutation pode semear o cache ['matriz-custo'] com a resposta.
 */
export const matrizCustoApi = {
  obter: async () => {
    const { data } = await api.get<MatrizCustoView>('/matriz-custo');
    return data;
  },
  atualizarOperacional: async (payload: UpdateOperacionalPayload) => {
    const { data } = await api.patch<MatrizCustoView>('/matriz-custo/operacional', payload);
    return data;
  },
  atualizarFiscal: async (payload: UpdateFiscalPayload) => {
    const { data } = await api.patch<MatrizCustoView>('/matriz-custo/fiscal', payload);
    return data;
  },
};
