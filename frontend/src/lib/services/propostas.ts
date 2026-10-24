import { api } from '@/lib/api';
import type { CondicoesProposta, PropostaDetalhe, PropostaListItem } from '@/lib/types';

/** Proposta comercial (10/26): orçamentos de um cliente num documento com aceite assinado. */
export const propostasApi = {
  condicoesPadrao: async () => {
    const { data } = await api.get<CondicoesProposta>('/propostas/condicoes-padrao');
    return data;
  },
  listar: async (params: { cliente_id?: string; status?: string }) => {
    const { data } = await api.get<PropostaListItem[]>('/propostas', { params });
    return data;
  },
  obter: async (id: string) => {
    const { data } = await api.get<PropostaDetalhe>(`/propostas/${id}`);
    return data;
  },
  criar: async (payload: {
    cliente_id: string;
    orcamento_ids: string[];
    condicoes?: Partial<CondicoesProposta>;
    observacoes?: string;
  }) => {
    const { data } = await api.post<PropostaDetalhe>('/propostas', payload);
    return data;
  },
  assinar: async (id: string, payload: { assinada_por_nome: string; assinada_por_documento?: string; assinada_em?: string }) => {
    const { data } = await api.post<PropostaDetalhe>(`/propostas/${id}/assinar`, payload);
    return data;
  },
  cancelar: async (id: string, motivo?: string) => {
    const { data } = await api.post<PropostaDetalhe>(`/propostas/${id}/cancelar`, { motivo });
    return data;
  },
  // PDF via axios (blob) para levar o Bearer; dispara o download.
  baixarPdf: async (id: string) => {
    const resp = await api.get<Blob>(`/propostas/${id}/pdf`, { responseType: 'blob' });
    const cd = resp.headers['content-disposition'] as string | undefined;
    const bruto = cd?.match(/filename="?([^"]+)"?/)?.[1];
    const filename = bruto ? decodeURIComponent(bruto) : `proposta-${id}.pdf`;
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
};
