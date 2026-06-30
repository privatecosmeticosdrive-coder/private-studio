import { api } from '@/lib/api';
import type {
  MatrizCustoView,
  UpdateOperacionalPayload,
  UpdateFiscalPayload,
  Ncm,
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

/** POST /matriz-custo/ncm (espelha CreateNcmDto). provisorio/ativo têm default no backend. */
export interface CreateNcmPayload {
  ncm: string;
  descricao: string;
  ipi_pct: number;
  monofasico: boolean;
  provisorio?: boolean;
  ativo?: boolean;
}

/**
 * NCM (CRUD da Matriz de Custo — Bloco B). Mesmo AcessoCustoGuard.
 * Reativar = atualizar(id, { ativo: true }) — reusa o PATCH, sem endpoint próprio.
 */
export const ncmApi = {
  // Backend retorna array puro (sem paginação), ordenado por ncm asc.
  listar: async (incluirInativas?: boolean) => {
    const { data } = await api.get<Ncm[]>('/matriz-custo/ncm', {
      params: incluirInativas ? { incluirInativas: true } : undefined,
    });
    return data;
  },
  criar: async (payload: CreateNcmPayload) => {
    const { data } = await api.post<Ncm>('/matriz-custo/ncm', payload);
    return data;
  },
  atualizar: async (id: number, payload: Partial<CreateNcmPayload>) => {
    const { data } = await api.patch<Ncm>(`/matriz-custo/ncm/${id}`, payload);
    return data;
  },
  remover: async (id: number) => {
    await api.delete(`/matriz-custo/ncm/${id}`);
  },
};
