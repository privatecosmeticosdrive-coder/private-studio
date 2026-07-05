import type { NivelOrcamento } from '@/lib/types';

/**
 * Estado único do wizard de orçamento. Campos numéricos ficam como string
 * (inputs controlados) e são convertidos no payload final. As 4 etapas leem e
 * escrevem aqui via `patch`.
 */
export interface OrcamentoForm {
  // Etapa 1 — Briefing
  produto: string;
  cliente_id: string;
  categoria: string;
  nivel: NivelOrcamento | '';
  volume_un: string;
  quantidade: string; // default '1000' (impacta MO — Doc 2d)
  produto_referencia: string;
  requer_amostra: boolean;
  amostra_qtd: string;
  // F4 Fase A (D2) — modo de operação fiscal (decide a matriz de tributos)
  modo_operacao: 'full_service' | 'hibrido' | 'industrializacao';

  // Etapa 2 — Match / fórmula (usada como está; editor de composição é Dia 12)
  formula_id: number | null;
  formula_nome: string;
  sem_formula: boolean;
  budget_mp: string; // base de MP manual quando não há fórmula

  // Etapa 3 — Embalagem
  embalagem_id: number | null;
  embalagem_nome: string;
  sem_embalagem: boolean;

  // Etapa 4 — Cálculo (únicos editáveis: un_min + margem_pct)
  un_min: string;
  margem_pct: string; // default '30'
}

/** Valores iniciais do formulário. */
export const FORM_INICIAL: OrcamentoForm = {
  produto: '',
  cliente_id: '',
  categoria: '',
  nivel: '',
  volume_un: '',
  quantidade: '1000',
  produto_referencia: '',
  requer_amostra: true,
  amostra_qtd: '',
  modo_operacao: 'full_service', // default conservador (D4)
  formula_id: null,
  formula_nome: '',
  sem_formula: false,
  budget_mp: '',
  embalagem_id: null,
  embalagem_nome: '',
  sem_embalagem: false,
  un_min: '',
  margem_pct: '30',
};

/** Props compartilhadas pelas etapas do wizard. */
export interface EtapaProps {
  form: OrcamentoForm;
  patch: (parcial: Partial<OrcamentoForm>) => void;
}
