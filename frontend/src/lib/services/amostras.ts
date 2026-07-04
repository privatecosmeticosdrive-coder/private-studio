import { api } from '@/lib/api';
import type { AmostraPipeline } from '@/lib/types';

export const amostrasApi = {
  // Kanban do pipeline de amostragem (grupos por amostra_status).
  // NOTA: o endpoint devolve os ITENS de cada grupo (sem count próprio); a
  // contagem no dashboard usa itens.length. Se a base de amostras crescer,
  // criar um endpoint de contagem para não baixar o pipeline inteiro.
  pipeline: async () => {
    const { data } = await api.get<AmostraPipeline>('/amostras/pipeline');
    return data;
  },
};
