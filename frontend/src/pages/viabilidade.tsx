import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { FieldErrors, FieldValues, Path, UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { ArrowLeft, Copy, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/auth/auth-context';
import { cn } from '@/lib/utils';
import { viabilidadeApi } from '@/lib/services/viabilidade';
import type {
  AlertaViabilidade,
  ContextoViabilidade,
  DreProjeto,
  PremissasCenario,
  PremissasViabilidade,
  ProjetoViabilidade,
  ResultadoCenario,
  ResultadoViabilidade,
  StatusProjetoViabilidade,
} from '@/lib/viabilidade-types';

// ============================ formatação (pt-BR) ============================

const fmtN = (n: number | null | undefined, casas = 2) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const fmtBRL = (n: number | null | undefined, casas = 2) => (n == null ? '—' : `R$ ${fmtN(n, casas)}`);
const fmtPct = (n: number | null | undefined, casas = 2) => (n == null ? '—' : `${fmtN(n, casas)}%`);
const fmtData = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Extrai a mensagem de erro da API (string | string[]) para o toast. */
function msgErro(err: AxiosError<{ message?: string | string[] }>, fallback: string) {
  const m = err.response?.data?.message;
  return Array.isArray(m) ? m[0] : m || fallback;
}

/** mensagem de erro de um caminho aninhado ("ideal.volume_un"). */
function erroEm(errors: FieldErrors, path: string): string | undefined {
  let cur: unknown = errors;
  for (const p of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return (cur as { message?: string } | undefined)?.message;
}

// ============================ schema do formulário ============================

const num = z.number({ message: 'Valor inválido' });
/**
 * Número opcional: campo vazio chega como NaN (valueAsNumber) e significa
 * "não informado" — estado válido, convertido para null ao montar as premissas.
 * (sem preprocess/transform: mantém input e output iguais para o resolver.)
 */
const numOpt = z.union([num.min(0, 'Não pode ser negativo'), z.nan(), z.null()]);
const ouNull = (v: number | null) => (v == null || Number.isNaN(v) ? null : v);

const MODOS = ['full_service', 'hibrido', 'industrializacao'] as const;
const REGIMES = ['', 'simples', 'lucro_real_presumido', 'consumidor_final_cpf'] as const;
const FINALIDADES = ['', 'revenda', 'industrializacao', 'uso_proprio'] as const;
const STATUS = ['rascunho', 'analisado', 'aprovado', 'descartado'] as const;

const cenarioSchema = z.object({
  produto: z.string().min(1, 'Informe o produto'),
  volume_un: num.min(0.0001, 'Informe o volume (mL/g)'),
  quantidade: num.min(1, 'Informe a quantidade por lote'),
  lotes_por_mes: num.min(0.0001, 'Informe os lotes por mês'),
  un_min: num.min(0.0001, 'Informe a velocidade (un/min)'),
  cmp_base_mp_kg: num.min(0, 'Não pode ser negativo'),
  perda_mp_pct: num.min(0, 'Não pode ser negativo'),
  credito_mp_pct: num.min(0, 'Não pode ser negativo').max(99, 'Máximo 99'),
  credito_emb_pct: num.min(0, 'Não pode ser negativo').max(99, 'Máximo 99'),
  embalagem_un: num.min(0, 'Não pode ser negativo'),
  taxa_gestao_embalagem_pct: num.min(0, 'Não pode ser negativo'),
  frete_un_brl: num.min(0, 'Não pode ser negativo'),
  modo_operacao: z.enum(MODOS),
  regime_fiscal: z.enum(REGIMES),
  finalidade: z.enum(FINALIDADES),
  uf: z.string().max(2, 'UF com 2 letras'),
  contribuinte_icms: z.enum(['', 'sim', 'nao']),
  ncm_id: z.string().min(1, 'Escolha a NCM'),
  margem_pct: numOpt,
  preco_venda_un: numOpt,
  investimento_brl: num.min(0, 'Não pode ser negativo'),
  investimento_meses_depreciacao: num.min(0, 'Não pode ser negativo'),
  custo_fixo_incremental_mes: num.min(0, 'Não pode ser negativo'),
  horizonte_meses: num.min(1, 'Mínimo 1 mês'),
  margem_minima_aceitavel_pct: num.min(0, 'Não pode ser negativo').max(99, 'Máximo 99'),
  pessoas_por_linha: num.min(0.0001, 'Informe as pessoas por linha'),
  ocupacao_atual_pct: numOpt,
  custo_hora_extra_hora: numOpt,
  horas_extra_maximas_mes: numOpt,
});
type CenarioForm = z.infer<typeof cenarioSchema>;

const schema = z.object({
  nome: z.string().min(2, 'Nome com pelo menos 2 caracteres'),
  cliente_id: z.string(),
  status: z.enum(STATUS),
  observacoes: z.string(),
  ideal: cenarioSchema,
  limite: cenarioSchema,
});
type FormValues = z.infer<typeof schema>;

// ====================== conversões form <-> premissas ======================

const idNcm = (n: { ncm: string; ex_tipi: string }) => `${n.ncm}|${n.ex_tipi ?? ''}`;

function cenarioParaPremissas(c: CenarioForm, ctx: ContextoViabilidade): PremissasCenario {
  const ncm = ctx.ncms.find((n) => idNcm(n) === c.ncm_id);
  if (!ncm) throw new Error('NCM escolhida não está mais ativa. Escolha outra.');
  return {
    produto: c.produto,
    volume_un: c.volume_un,
    quantidade: c.quantidade,
    lotes_por_mes: c.lotes_por_mes,
    un_min: c.un_min,
    cmp_base_mp_kg: c.cmp_base_mp_kg,
    perda_mp_pct: c.perda_mp_pct,
    credito_mp_pct: c.credito_mp_pct,
    credito_emb_pct: c.credito_emb_pct,
    embalagem_un: c.embalagem_un,
    taxa_gestao_embalagem_pct: c.taxa_gestao_embalagem_pct,
    frete_un_brl: c.frete_un_brl,
    modo_operacao: c.modo_operacao,
    perfil_fiscal: {
      regime_fiscal: c.regime_fiscal === '' ? null : c.regime_fiscal,
      finalidade: c.finalidade === '' ? null : c.finalidade,
      uf: c.uf.trim() === '' ? null : c.uf.trim().toUpperCase(),
      contribuinte_icms: c.contribuinte_icms === '' ? null : c.contribuinte_icms === 'sim',
    },
    ncm: {
      ncm: ncm.ncm,
      ex_tipi: ncm.ex_tipi,
      ipi_pct: ncm.ipi_pct,
      monofasico: ncm.monofasico,
      tratamento: ncm.tratamento,
      icms_nominal_pct: ncm.icms_nominal_pct,
    },
    margem_pct: ouNull(c.margem_pct),
    preco_venda_un: ouNull(c.preco_venda_un),
    investimento_brl: c.investimento_brl,
    investimento_meses_depreciacao: c.investimento_meses_depreciacao,
    custo_fixo_incremental_mes: c.custo_fixo_incremental_mes,
    horizonte_meses: c.horizonte_meses,
    margem_minima_aceitavel_pct: c.margem_minima_aceitavel_pct,
    pessoas_por_linha: c.pessoas_por_linha,
    ocupacao_atual_pct: ouNull(c.ocupacao_atual_pct),
    custo_hora_extra_hora: ouNull(c.custo_hora_extra_hora),
    horas_extra_maximas_mes: ouNull(c.horas_extra_maximas_mes),
  };
}

function formParaPremissas(d: FormValues, ctx: ContextoViabilidade): PremissasViabilidade {
  return { ideal: cenarioParaPremissas(d.ideal, ctx), limite: cenarioParaPremissas(d.limite, ctx) };
}

function premissasParaCenario(p: PremissasCenario, ctx: ContextoViabilidade): CenarioForm {
  const ncmId = idNcm(p.ncm);
  return {
    produto: p.produto,
    volume_un: p.volume_un,
    quantidade: p.quantidade,
    lotes_por_mes: p.lotes_por_mes,
    un_min: p.un_min,
    cmp_base_mp_kg: p.cmp_base_mp_kg,
    perda_mp_pct: p.perda_mp_pct,
    credito_mp_pct: p.credito_mp_pct,
    credito_emb_pct: p.credito_emb_pct,
    embalagem_un: p.embalagem_un,
    taxa_gestao_embalagem_pct: p.taxa_gestao_embalagem_pct,
    frete_un_brl: p.frete_un_brl,
    modo_operacao: p.modo_operacao,
    regime_fiscal: p.perfil_fiscal?.regime_fiscal ?? '',
    finalidade: p.perfil_fiscal?.finalidade ?? '',
    uf: p.perfil_fiscal?.uf ?? '',
    contribuinte_icms:
      p.perfil_fiscal?.contribuinte_icms == null ? '' : p.perfil_fiscal.contribuinte_icms ? 'sim' : 'nao',
    // NCM desativada desde o cálculo: campo fica vazio e o zod cobra — nunca troca em silêncio.
    ncm_id: ctx.ncms.some((n) => idNcm(n) === ncmId) ? ncmId : '',
    margem_pct: p.margem_pct ?? null,
    preco_venda_un: p.preco_venda_un ?? null,
    investimento_brl: p.investimento_brl,
    investimento_meses_depreciacao: p.investimento_meses_depreciacao,
    custo_fixo_incremental_mes: p.custo_fixo_incremental_mes,
    horizonte_meses: p.horizonte_meses,
    margem_minima_aceitavel_pct: p.margem_minima_aceitavel_pct,
    pessoas_por_linha: p.pessoas_por_linha,
    ocupacao_atual_pct: p.ocupacao_atual_pct ?? null,
    custo_hora_extra_hora: p.custo_hora_extra_hora ?? null,
    horas_extra_maximas_mes: p.horas_extra_maximas_mes ?? null,
  };
}

/**
 * Cenário inicial: SÓ o que tem fonte (parâmetros vigentes via contexto.defaults).
 * O resto fica em branco/zero e o zod cobra — sem número inventado (regra 6).
 */
function cenarioInicial(ctx: ContextoViabilidade): CenarioForm {
  const def = (campo: string): number | null => {
    const d = ctx.defaults.find((x) => x.campo === campo);
    return d && typeof d.valor === 'number' ? d.valor : null;
  };
  return {
    produto: '',
    volume_un: NaN,
    quantidade: NaN,
    lotes_por_mes: 1,
    un_min: def('un_min') ?? NaN,
    cmp_base_mp_kg: NaN,
    perda_mp_pct: def('perda_mp_pct') ?? NaN,
    credito_mp_pct: def('credito_mp_pct') ?? NaN,
    credito_emb_pct: def('credito_emb_pct') ?? NaN,
    embalagem_un: 0,
    taxa_gestao_embalagem_pct: def('taxa_gestao_embalagem_pct') ?? NaN,
    frete_un_brl: def('frete_un_brl') ?? NaN,
    modo_operacao: 'full_service',
    regime_fiscal: '',
    finalidade: '',
    uf: '',
    contribuinte_icms: '',
    ncm_id: '',
    margem_pct: null,
    preco_venda_un: null,
    investimento_brl: 0,
    investimento_meses_depreciacao: 0,
    custo_fixo_incremental_mes: 0,
    horizonte_meses: 12,
    margem_minima_aceitavel_pct: NaN,
    pessoas_por_linha: def('pessoas_por_linha') ?? NaN,
    ocupacao_atual_pct: null,
    custo_hora_extra_hora: def('custo_hora_extra_hora'),
    horas_extra_maximas_mes: null,
  };
}

// ============================ campos do formulário ============================

/** Campo numérico genérico (declarado fora do render — evita reset de estado). */
function Campo<T extends FieldValues>({
  register,
  errors,
  name,
  label,
  sufixo,
  step = '0.01',
  dica,
  placeholder,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  name: Path<T>;
  label: string;
  sufixo?: string;
  step?: string;
  dica?: string;
  placeholder?: string;
}) {
  const msg = erroEm(errors as FieldErrors, name);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="relative">
        <Input
          id={name}
          type="number"
          step={step}
          min="0"
          placeholder={placeholder}
          className={sufixo ? 'pr-16' : undefined}
          {...register(name, { valueAsNumber: true })}
        />
        {sufixo && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-caption text-warm-500">
            {sufixo}
          </span>
        )}
      </div>
      {dica && !msg && <p className="text-caption text-warm-500">{dica}</p>}
      {msg && <p className="text-caption text-error">{msg}</p>}
    </div>
  );
}

function CampoSelect<T extends FieldValues>({
  register,
  errors,
  name,
  label,
  opcoes,
  dica,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  name: Path<T>;
  label: string;
  opcoes: { value: string; label: string }[];
  dica?: string;
}) {
  const msg = erroEm(errors as FieldErrors, name);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
        {...register(name)}
      >
        {opcoes.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {dica && !msg && <p className="text-caption text-warm-500">{dica}</p>}
      {msg && <p className="text-caption text-error">{msg}</p>}
    </div>
  );
}

function CampoTexto<T extends FieldValues>({
  register,
  errors,
  name,
  label,
  dica,
  placeholder,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  name: Path<T>;
  label: string;
  dica?: string;
  placeholder?: string;
}) {
  const msg = erroEm(errors as FieldErrors, name);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} placeholder={placeholder} {...register(name)} />
      {dica && !msg && <p className="text-caption text-warm-500">{dica}</p>}
      {msg && <p className="text-caption text-error">{msg}</p>}
    </div>
  );
}

/** Definição de um campo numérico de cenário (renderizado nas DUAS colunas). */
interface DefCampoNum {
  tipo: 'num';
  campo: keyof CenarioForm;
  label: string;
  sufixo?: string;
  step?: string;
  placeholder?: string;
}
interface DefCampoSel {
  tipo: 'sel';
  campo: keyof CenarioForm;
  label: string;
  opcoes: { value: string; label: string }[];
}
interface DefCampoTxt {
  tipo: 'txt';
  campo: keyof CenarioForm;
  label: string;
  placeholder?: string;
}
type DefCampo = DefCampoNum | DefCampoSel | DefCampoTxt;

const OPC_MODO = [
  { value: 'full_service', label: 'Full service (Private fornece tudo)' },
  { value: 'hibrido', label: 'Híbrido (cliente fornece a embalagem)' },
  { value: 'industrializacao', label: 'Industrialização (cliente fornece insumos)' },
];
const OPC_REGIME = [
  { value: '', label: 'Não informado (pior caso)' },
  { value: 'lucro_real_presumido', label: 'Lucro real / presumido (RPA)' },
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'consumidor_final_cpf', label: 'Consumidor final (CPF)' },
];
const OPC_FINALIDADE = [
  { value: '', label: 'Não informada' },
  { value: 'revenda', label: 'Revenda' },
  { value: 'industrializacao', label: 'Industrialização' },
  { value: 'uso_proprio', label: 'Uso próprio' },
];
const OPC_CONTRIB = [
  { value: '', label: 'Não informado' },
  { value: 'sim', label: 'Contribuinte de ICMS' },
  { value: 'nao', label: 'Não contribuinte' },
];

const SECOES: { titulo: string; descricao?: string; campos: DefCampo[] }[] = [
  {
    titulo: 'Produto e lote',
    campos: [
      { tipo: 'txt', campo: 'produto', label: 'Produto', placeholder: 'Ex.: Finalizador capilar 50 ml' },
      { tipo: 'num', campo: 'volume_un', label: 'Volume por unidade', sufixo: 'mL/g', step: '0.01' },
      { tipo: 'num', campo: 'quantidade', label: 'Quantidade por lote', sufixo: 'un', step: '1' },
      { tipo: 'num', campo: 'lotes_por_mes', label: 'Lotes por mês', sufixo: 'lotes', step: '0.01' },
      { tipo: 'num', campo: 'un_min', label: 'Velocidade da linha', sufixo: 'un/min', step: '0.01' },
    ],
  },
  {
    titulo: 'Material e créditos',
    descricao: 'MP pelo preço da última compra; créditos de entrada medidos nas NFs (parâmetro fiscal vigente).',
    campos: [
      { tipo: 'num', campo: 'cmp_base_mp_kg', label: 'Custo da fórmula (última compra)', sufixo: 'R$/kg', step: '0.0001' },
      { tipo: 'num', campo: 'perda_mp_pct', label: 'Perda de MP', sufixo: '%', step: '0.001' },
      { tipo: 'num', campo: 'credito_mp_pct', label: 'Crédito de entrada da MP', sufixo: '%', step: '0.01' },
      { tipo: 'num', campo: 'embalagem_un', label: 'Embalagem por unidade (bruta)', sufixo: 'R$', step: '0.0001' },
      { tipo: 'num', campo: 'credito_emb_pct', label: 'Crédito de entrada da embalagem', sufixo: '%', step: '0.01' },
      { tipo: 'num', campo: 'taxa_gestao_embalagem_pct', label: 'Taxa de gestão da embalagem', sufixo: '%', step: '0.01' },
      { tipo: 'num', campo: 'frete_un_brl', label: 'Frete por unidade', sufixo: 'R$', step: '0.0001' },
    ],
  },
  {
    titulo: 'Operação e perfil fiscal',
    descricao: 'Mesma matriz fiscal dos orçamentos: modo x perfil do cliente x NCM. Perfil em branco = pior caso.',
    campos: [
      { tipo: 'sel', campo: 'modo_operacao', label: 'Modo de operação', opcoes: OPC_MODO },
      { tipo: 'sel', campo: 'regime_fiscal', label: 'Regime fiscal do cliente', opcoes: OPC_REGIME },
      { tipo: 'sel', campo: 'finalidade', label: 'Finalidade', opcoes: OPC_FINALIDADE },
      { tipo: 'txt', campo: 'uf', label: 'UF do cliente', placeholder: 'SP' },
      { tipo: 'sel', campo: 'contribuinte_icms', label: 'Contribuinte de ICMS', opcoes: OPC_CONTRIB },
      { tipo: 'sel', campo: 'ncm_id', label: 'NCM do produto', opcoes: [] }, // opções injetadas no render
    ],
  },
  {
    titulo: 'Preço e margem',
    descricao: 'Margem em branco = escada do Motor 2 por lote. Preço em branco = calculado; informado = imposto pelo cliente/mercado (a margem é derivada).',
    campos: [
      { tipo: 'num', campo: 'margem_pct', label: 'Margem manual (markup)', sufixo: '%', step: '0.01', placeholder: 'escada' },
      { tipo: 'num', campo: 'preco_venda_un', label: 'Preço de venda imposto (sem IPI)', sufixo: 'R$', step: '0.0001', placeholder: 'calculado' },
      { tipo: 'num', campo: 'margem_minima_aceitavel_pct', label: 'Margem mínima aceitável do projeto', sufixo: '%', step: '0.01' },
    ],
  },
  {
    titulo: 'Investimento e custos do projeto',
    campos: [
      { tipo: 'num', campo: 'investimento_brl', label: 'Investimento (equipamentos, moldes)', sufixo: 'R$', step: '0.01' },
      { tipo: 'num', campo: 'investimento_meses_depreciacao', label: 'Depreciação do investimento', sufixo: 'meses', step: '1' },
      { tipo: 'num', campo: 'custo_fixo_incremental_mes', label: 'Custo fixo incremental (pessoa, aluguel extra)', sufixo: 'R$/mês', step: '0.01' },
      { tipo: 'num', campo: 'horizonte_meses', label: 'Horizonte da análise', sufixo: 'meses', step: '1' },
    ],
  },
  {
    titulo: 'Capacidade e hora extra',
    descricao: 'Ocupação em branco = desconhecida (a hora extra não é avaliada). Custo da HE em branco = alerta, nunca zero.',
    campos: [
      { tipo: 'num', campo: 'pessoas_por_linha', label: 'Pessoas por linha', sufixo: 'pessoas', step: '0.5' },
      { tipo: 'num', campo: 'ocupacao_atual_pct', label: 'Ocupação atual da fábrica', sufixo: '%', step: '0.01', placeholder: 'desconhecida' },
      { tipo: 'num', campo: 'custo_hora_extra_hora', label: 'Custo da hora extra (por pessoa-hora)', sufixo: 'R$/h', step: '0.01', placeholder: 'não informado' },
      { tipo: 'num', campo: 'horas_extra_maximas_mes', label: 'Teto de horas extras de linha', sufixo: 'h/mês', step: '0.5', placeholder: 'sem teto' },
    ],
  },
];

// ============================ blocos de resultado ============================

function FaixasAlerta({ alertas }: { alertas: AlertaViabilidade[] }) {
  if (alertas.length === 0) {
    return <p className="rounded-md border border-success/40 bg-success-soft px-3 py-2 text-caption text-success">Sem alertas neste cenário.</p>;
  }
  return (
    <div className="space-y-2">
      {alertas.map((a, i) => (
        <div
          key={`${a.codigo}-${i}`}
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            a.nivel === 'bloqueante'
              ? 'border-error bg-error-soft text-error'
              : 'border-warning bg-warning-soft text-warning',
          )}
        >
          <span className="mr-2 text-caption font-semibold uppercase">{a.nivel === 'bloqueante' ? 'Bloqueante' : 'Atenção'}</span>
          {a.mensagem}
        </div>
      ))}
    </div>
  );
}

function Linha({ rotulo, valor, destaque, origem }: { rotulo: string; valor: string; destaque?: boolean; origem?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5">
      <span className={cn('text-sm', destaque ? 'font-medium text-ink' : 'text-warm-700')}>
        {rotulo}
        {origem && <span className="ml-1 text-caption text-warm-500">({origem})</span>}
      </span>
      <span className={cn('tnum text-sm', destaque ? 'font-semibold text-ink' : 'text-ink')}>{valor}</span>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="pt-2 text-caption font-semibold uppercase tracking-wide text-warm-500">{titulo}</h4>
      {children}
    </div>
  );
}

const ORIGEM_MARGEM: Record<ResultadoCenario['preco']['margem_origem'], string> = {
  escada: 'escada do Motor 2',
  manual: 'informada',
  derivada: 'derivada do preço imposto',
  inviavel: 'preço abaixo do custo',
};

function CardCenario({ r, titulo }: { r: ResultadoCenario; titulo: string }) {
  const p = r.preco;
  const u = r.unitario;
  const t = r.tempo_linha;
  const he = r.hora_extra;
  const pe = r.ponto_equilibrio;
  const inv = r.investimento;
  const pm = r.precos_minimos;
  return (
    <div className={cn('space-y-3 rounded-lg border bg-surface p-5', r.bloqueado ? 'border-error' : 'border-border')}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-ink">{titulo}</h3>
        {r.bloqueado ? <Badge variant="error">bloqueado</Badge> : <Badge variant="success">sem bloqueio</Badge>}
      </div>
      <FaixasAlerta alertas={r.alertas} />

      <Bloco titulo="Preço unitário">
        <Linha rotulo="Preço sem IPI" valor={fmtBRL(p.preco_sipi)} destaque origem={p.origem === 'motor2' ? 'Motor 2' : 'imposto'} />
        <Linha rotulo="IPI por fora" valor={`${fmtBRL(p.ipi_un)} (${fmtPct(p.ipi_pct)})`} />
        {p.icms_sobre_ipi_un > 0 && <Linha rotulo="ICMS sobre o IPI" valor={fmtBRL(p.icms_sobre_ipi_un)} />}
        <Linha rotulo="Preço com IPI" valor={fmtBRL(p.preco_cipi)} destaque />
        <Linha rotulo="Parcela produto (sem IPI)" valor={fmtBRL(p.preco_produto_sipi)} />
        <Linha rotulo="Parcela embalagem (sem IPI)" valor={fmtBRL(p.preco_embalagem_sipi)} />
        <Linha rotulo="Margem aplicada (markup)" valor={fmtPct(p.margem_pct)} origem={ORIGEM_MARGEM[p.margem_origem]} />
        <Linha rotulo="Escada para o lote" valor={`${fmtPct(p.margem_escada_pct, 0)} (${p.faixa_lote})`} />
        <Linha rotulo="Tributos por dentro" valor={fmtPct(p.tributos_por_dentro_pct)} origem="matriz fiscal" />
      </Bloco>

      <Bloco titulo="Decomposição por unidade">
        <Linha rotulo="MP bruta" valor={fmtBRL(u.mp_bruta, 4)} />
        <Linha rotulo="Perda de MP" valor={fmtBRL(u.perda, 4)} />
        <Linha rotulo="Crédito de entrada (MP)" valor={`- ${fmtBRL(u.credito_mp, 4)}`} />
        <Linha rotulo="MP líquida" valor={fmtBRL(u.mp_liquida, 4)} destaque />
        <Linha rotulo="Embalagem líquida" valor={fmtBRL(u.embalagem_liquida, 4)} />
        <Linha rotulo="Frete" valor={fmtBRL(u.frete, 4)} />
        <Linha rotulo="Fábrica — setup diluído" valor={fmtBRL(u.fabrica_setup, 4)} origem="parâmetro vigente" />
        <Linha rotulo="Fábrica — corrida" valor={fmtBRL(u.fabrica_corrida, 4)} origem="parâmetro vigente" />
        <Linha rotulo="Custo total" valor={fmtBRL(u.custo_total, 4)} destaque />
        <Linha rotulo="Tributos por dentro (R$)" valor={fmtBRL(u.tributos_por_dentro, 4)} />
        <Linha rotulo="IPI por fora (R$)" valor={fmtBRL(u.ipi_por_fora, 4)} />
        <Linha rotulo="Margem em R$" valor={`${fmtBRL(u.margem_brl, 4)} (${fmtPct(u.margem_sobre_preco_pct)})`} destaque />
        <Linha rotulo="Margem de contribuição (sem fábrica)" valor={fmtBRL(u.margem_contribuicao, 4)} />
        <Linha rotulo="Margem de contribuição com absorção" valor={fmtBRL(u.margem_contribuicao_com_absorcao, 4)} />
      </Bloco>

      <Bloco titulo="Tempo de linha">
        <Linha rotulo="Setup por lote" valor={`${fmtN(t.setup_minutos, 0)} min`} origem="parâmetro vigente" />
        <Linha rotulo="Corrida por lote" valor={`${fmtN(t.corrida_minutos_lote, 1)} min`} />
        <Linha rotulo="Tempo de linha por lote" valor={`${fmtN(t.minutos_lote, 1)} min = ${fmtN(t.horas_lote)} h = ${fmtN(t.dias_linha_lote)} dias de linha`} destaque />
        <Linha rotulo="Horas-homem por lote" valor={`${fmtN(t.horas_homem_lote)} h (${fmtN(t.pessoas_por_linha, 1)} pessoas)`} />
        <Linha rotulo="Minutos de linha por mês" valor={`${fmtN(t.minutos_mes, 0)} min (${fmtN(t.horas_mes, 1)} h)`} />
        <Linha rotulo="Capacidade normal do mês" valor={`${fmtN(t.capacidade_normal_min_mes, 0)} min`} origem="parâmetro vigente" />
        <Linha rotulo="Ocupação pelo projeto" valor={fmtPct(t.ocupacao_projeto_pct)} destaque />
        <Linha rotulo="Ocupação atual + projeto" valor={t.ocupacao_total_pct == null ? 'ocupação atual não informada' : fmtPct(t.ocupacao_total_pct)} />
      </Bloco>

      <Bloco titulo="Hora extra">
        {!he.avaliada ? (
          <p className="py-1 text-sm text-warm-700">Não avaliada: informe a ocupação atual da fábrica.</p>
        ) : (
          <>
            <Linha rotulo="Minutos excedentes/mês" valor={`${fmtN(he.minutos_excedentes_mes, 0)} min`} />
            <Linha rotulo="Horas de linha extras/mês" valor={`${fmtN(he.horas_linha_extra_mes)} h`} />
            <Linha rotulo="Horas-pessoa extras/mês" valor={`${fmtN(he.horas_pessoa_extra_mes)} h`} />
            <Linha rotulo="Custo da HE/mês" valor={he.custo_mes == null ? 'custo da HE não informado' : fmtBRL(he.custo_mes)} destaque origem={he.custo_hora_pessoa != null ? `${fmtBRL(he.custo_hora_pessoa)}/pessoa-h` : undefined} />
            <Linha rotulo="Teto de HE" valor={he.teto_horas_mes == null ? 'sem teto' : `${fmtN(he.teto_horas_mes, 1)} h/mês${he.excede_teto ? ' — EXCEDIDO' : ''}`} />
          </>
        )}
      </Bloco>

      <Bloco titulo="Investimento e payback">
        <Linha rotulo="Investimento" valor={fmtBRL(inv.valor)} origem="informado" />
        <Linha rotulo="Depreciação mensal" valor={`${fmtBRL(inv.depreciacao_mes)} (${inv.meses_depreciacao} meses)`} />
        <Linha rotulo="Payback" valor={inv.payback_meses == null ? 'nunca (fluxo de caixa <= 0)' : `${fmtN(inv.payback_meses, 1)} meses`} destaque />
      </Bloco>

      <Bloco titulo="Ponto de equilíbrio (custos incrementais)">
        <Linha rotulo="Custos fixos incrementais/mês" valor={fmtBRL(pe.custos_fixos_incrementais_mes)} />
        <Linha rotulo="Margem de contribuição unitária" valor={fmtBRL(pe.margem_contribuicao_un, 4)} />
        <Linha rotulo="PE em unidades/mês" valor={pe.unidades_mes == null ? 'inatingível (MC <= 0)' : fmtN(pe.unidades_mes, 0)} destaque />
        <Linha rotulo="PE em lotes/mês" valor={fmtN(pe.lotes_mes)} />
        <Linha rotulo="Produção mínima para dar lucro" valor={pe.producao_minima_lotes_mes == null ? '—' : `${pe.producao_minima_lotes_mes} lote(s) = ${fmtN(pe.producao_minima_unidades_mes, 0)} un/mês`} destaque />
        <Linha rotulo="PE com absorção da fábrica (un/mês)" valor={pe.com_absorcao.unidades_mes == null ? 'inatingível' : fmtN(pe.com_absorcao.unidades_mes, 0)} />
      </Bloco>

      <Bloco titulo="Preços mínimos (sem IPI)">
        <Linha rotulo="Preço mínimo viável (lucro zero no horizonte)" valor={pm.viavel == null ? 'inatingível' : fmtBRL(pm.viavel, 4)} destaque />
        <Linha rotulo={`Preço mínimo com margem de ${fmtPct(pm.margem_minima_aceitavel_pct)}`} valor={pm.com_margem_minima == null ? 'inatingível' : fmtBRL(pm.com_margem_minima, 4)} destaque />
      </Bloco>
    </div>
  );
}

function TabelaEspelho({ r }: { r: ResultadoViabilidade }) {
  const fmt = (v: number | null, unidade: string) =>
    v == null ? '—' : unidade === 'R$' ? fmtBRL(v) : unidade === '%' ? fmtPct(v) : `${fmtN(v, unidade === 'meses' ? 1 : 0)} ${unidade}`;
  return (
    <div className="space-y-3 rounded-lg border border-gold-500/60 bg-gold-500/5 p-5">
      <div>
        <h3 className="font-medium text-ink">Espelho — ideal x até onde podemos ir</h3>
        <p className="text-caption text-warm-500">Diferença = limite − ideal.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-caption text-warm-500">
              <th className="py-2 pr-4">Indicador</th>
              <th className="py-2 pr-4 text-right">Cenário ideal</th>
              <th className="py-2 pr-4 text-right">Até onde podemos ir</th>
              <th className="py-2 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {r.espelho.map((l) => (
              <tr key={l.campo} className="border-b border-border/50">
                <td className="py-2 pr-4 font-medium text-ink">{l.rotulo}</td>
                <td className="py-2 pr-4 text-right tnum">{fmt(l.ideal, l.unidade)}</td>
                <td className="py-2 pr-4 text-right tnum">{fmt(l.limite, l.unidade)}</td>
                <td className={cn('py-2 text-right tnum', l.diferenca != null && l.diferenca < 0 ? 'text-error' : l.diferenca != null && l.diferenca > 0 ? 'text-success' : 'text-warm-500')}>
                  {l.diferenca == null ? '—' : `${l.diferenca > 0 ? '+' : ''}${fmt(l.diferenca, l.unidade)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const LINHAS_DRE: { campo: keyof DreProjeto; rotulo: string; destaque?: boolean; recuo?: boolean }[] = [
  { campo: 'unidades', rotulo: 'Unidades' },
  { campo: 'lotes', rotulo: 'Lotes' },
  { campo: 'receita_bruta_sipi', rotulo: 'Receita bruta (sem IPI)', destaque: true },
  { campo: 'tributos_por_dentro', rotulo: '(-) Tributos por dentro' },
  { campo: 'receita_liquida', rotulo: 'Receita líquida', destaque: true },
  { campo: 'mp_liquida', rotulo: '(-) MP líquida', recuo: true },
  { campo: 'embalagem_liquida', rotulo: '(-) Embalagem líquida', recuo: true },
  { campo: 'frete', rotulo: '(-) Frete', recuo: true },
  { campo: 'custos_variaveis', rotulo: 'Custos variáveis' },
  { campo: 'fabrica_setup', rotulo: '(-) Fábrica — setup', recuo: true },
  { campo: 'fabrica_corrida', rotulo: '(-) Fábrica — corrida', recuo: true },
  { campo: 'fabrica', rotulo: 'Fábrica (absorção)' },
  { campo: 'hora_extra', rotulo: '(-) Hora extra' },
  { campo: 'custo_fixo_incremental', rotulo: '(-) Custo fixo incremental' },
  { campo: 'depreciacao', rotulo: '(-) Depreciação do investimento' },
  { campo: 'lucro_operacional', rotulo: 'Lucro operacional do projeto', destaque: true },
  { campo: 'margem_sobre_receita_pct', rotulo: 'Margem sobre a receita' },
  { campo: 'fluxo_caixa_operacional', rotulo: 'Fluxo de caixa (lucro + depreciação)' },
];

function TabelaDre({ r }: { r: ResultadoViabilidade }) {
  const cols: { titulo: string; d: DreProjeto }[] = [
    { titulo: `Ideal — mês`, d: r.ideal.dre_mensal },
    { titulo: `Ideal — ${r.ideal.dre_horizonte.meses} meses`, d: r.ideal.dre_horizonte },
    { titulo: `Limite — mês`, d: r.limite.dre_mensal },
    { titulo: `Limite — ${r.limite.dre_horizonte.meses} meses`, d: r.limite.dre_horizonte },
  ];
  const cel = (d: DreProjeto, campo: keyof DreProjeto) => {
    const v = d[campo];
    if (campo === 'unidades' || campo === 'lotes') return fmtN(v as number, campo === 'lotes' ? 2 : 0);
    if (campo === 'margem_sobre_receita_pct') return v == null ? 'sem receita' : fmtPct(v as number);
    if (campo === 'hora_extra') return v == null ? 'não custeada' : fmtBRL(v as number);
    return fmtBRL(v as number);
  };
  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-5">
      <div>
        <h3 className="font-medium text-ink">DRE do projeto — mensal e no horizonte</h3>
        <p className="text-caption text-warm-500">Receita sem IPI; fábrica por absorção (setup + corrida na taxa/minuto vigente).</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-caption text-warm-500">
              <th className="py-2 pr-4">Linha</th>
              {cols.map((c) => (
                <th key={c.titulo} className="py-2 pr-4 text-right whitespace-nowrap">{c.titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINHAS_DRE.map((l) => (
              <tr key={l.campo} className={cn('border-b border-border/50', l.destaque && 'bg-warm-50/60')}>
                <td className={cn('py-2 pr-4', l.destaque ? 'font-medium text-ink' : 'text-warm-700', l.recuo && 'pl-4')}>{l.rotulo}</td>
                {cols.map((c) => (
                  <td key={c.titulo} className={cn('py-2 pr-4 text-right tnum', l.destaque && 'font-semibold text-ink')}>
                    {cel(c.d, l.campo)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Rastreabilidade({ r }: { r: ResultadoViabilidade }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border bg-sand/40 p-5">
      <button type="button" className="text-sm font-medium text-ink underline-offset-4 hover:underline" onClick={() => setAberto((v) => !v)}>
        {aberto ? 'Ocultar' : 'Mostrar'} premissas, fundamentos e vigências ({r.engine})
      </button>
      {aberto && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            <h4 className="text-caption font-semibold uppercase text-warm-500">Premissas usadas</h4>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-caption text-warm-700">
              {r.premissas_usadas.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
          <div>
            <h4 className="text-caption font-semibold uppercase text-warm-500">Fundamentos fiscais</h4>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-caption text-warm-700">
              {r.fundamentos.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
          <div>
            <h4 className="text-caption font-semibold uppercase text-warm-500">Vigências dos parâmetros</h4>
            <ul className="mt-1 space-y-1 text-caption text-warm-700">
              {r.vigencias_parametros.map((v) => (
                <li key={v.chave}>
                  <span className="font-medium text-ink">{v.chave}</span> = {fmtN(v.valor, 4)} (desde {new Date(v.vigencia_inicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' })})
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================ EDITOR ================================

const BADGE_STATUS: Record<StatusProjetoViabilidade, 'neutral' | 'info' | 'success' | 'warning'> = {
  rascunho: 'neutral',
  analisado: 'info',
  aprovado: 'success',
  descartado: 'warning',
};

function Editor({
  projetoId,
  ctx,
  onVoltar,
  onCriado,
}: {
  projetoId: number | null;
  ctx: ContextoViabilidade;
  onVoltar: () => void;
  onCriado: (id: number) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const { data: projeto, isLoading, isError } = useQuery({
    queryKey: ['viabilidade', projetoId],
    queryFn: () => viabilidadeApi.obter(projetoId!),
    enabled: projetoId != null,
  });

  const inicial = useMemo(() => cenarioInicial(ctx), [ctx]);
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: '', cliente_id: '', status: 'rascunho', observacoes: '', ideal: inicial, limite: inicial },
  });

  const [resultado, setResultado] = useState<ResultadoViabilidade | null>(null);
  const [premissasCalculadas, setPremissasCalculadas] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // projeto existente: carrega premissas e resultado gravados
  useEffect(() => {
    if (!projeto) return;
    const ideal = premissasParaCenario(projeto.premissas.ideal, ctx);
    const limite = premissasParaCenario(
      { ...projeto.premissas.ideal, ...(projeto.premissas.limite ?? {}) } as PremissasCenario,
      ctx,
    );
    reset({
      nome: projeto.nome,
      cliente_id: projeto.cliente_id ?? '',
      status: projeto.status,
      observacoes: projeto.observacoes ?? '',
      ideal,
      limite,
    });
    setResultado(projeto.resultado);
    setPremissasCalculadas(projeto.resultado ? JSON.stringify(projeto.premissas) : null);
  }, [projeto, ctx, reset]);

  // premissas atuais (para saber se o resultado exibido ainda corresponde ao formulário)
  const valores = watch();
  const premissasAtuais = useMemo(() => {
    try {
      return JSON.stringify(formParaPremissas(schema.parse(valores), ctx));
    } catch {
      return null;
    }
  }, [valores, ctx]);
  const desatualizado = resultado != null && premissasCalculadas != null && premissasAtuais !== premissasCalculadas;

  const aplicarResultado = (res: ResultadoViabilidade, premissas: PremissasViabilidade) => {
    setResultado(res);
    setPremissasCalculadas(JSON.stringify(premissas));
  };

  const calcular = useMutation({
    mutationFn: (premissas: PremissasViabilidade) => viabilidadeApi.calcular(premissas),
    onSuccess: (res, premissas) => {
      aplicarResultado(res, premissas);
      toast[res.ideal.bloqueado || res.limite.bloqueado ? 'error' : 'success'](
        res.ideal.bloqueado || res.limite.bloqueado ? 'Calculado — há alerta bloqueante' : 'Calculado (não salvo)',
      );
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => toast.error(msgErro(err, 'Falha ao calcular.')),
  });

  const salvar = useMutation({
    mutationFn: (d: FormValues) => {
      const premissas = formParaPremissas(d, ctx);
      const payload = {
        nome: d.nome,
        cliente_id: d.cliente_id || null,
        observacoes: d.observacoes || null,
        status: d.status,
        premissas,
      };
      return projetoId == null ? viabilidadeApi.criar(payload) : viabilidadeApi.atualizar(projetoId, payload);
    },
    onSuccess: (p: ProjetoViabilidade) => {
      queryClient.invalidateQueries({ queryKey: ['viabilidade'] });
      queryClient.setQueryData(['viabilidade', p.id], p);
      if (p.resultado) aplicarResultado(p.resultado, p.premissas);
      toast.success(projetoId == null ? 'Projeto criado e calculado' : 'Projeto salvo e recalculado');
      if (projetoId == null) onCriado(p.id);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => toast.error(msgErro(err, 'Falha ao salvar o projeto.')),
  });

  const recalcular = useMutation({
    mutationFn: () => viabilidadeApi.recalcular(projetoId!),
    onSuccess: (p: ProjetoViabilidade) => {
      queryClient.invalidateQueries({ queryKey: ['viabilidade'] });
      queryClient.setQueryData(['viabilidade', p.id], p);
      if (p.resultado) aplicarResultado(p.resultado, p.premissas);
      toast.success('Recalculado com a vigência de hoje');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => toast.error(msgErro(err, 'Falha ao recalcular.')),
  });

  const remover = useMutation({
    mutationFn: () => viabilidadeApi.remover(projetoId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viabilidade'] });
      toast.success('Projeto excluído');
      setExcluindo(false);
      onVoltar();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => toast.error(msgErro(err, 'Não foi possível excluir.')),
  });

  const copiarDoIdeal = () => {
    setValue('limite', { ...getValues('ideal') }, { shouldDirty: true });
    toast.success('Cenário limite espelhado do ideal');
  };

  // escolher o cliente preenche o perfil fiscal dos DOIS cenários (editável depois)
  const aplicarPerfilDoCliente = (clienteId: string) => {
    const c = ctx.clientes.find((x) => x.id === clienteId);
    if (!c) return;
    for (const cen of ['ideal', 'limite'] as const) {
      setValue(`${cen}.regime_fiscal`, c.regime_fiscal ?? '');
      setValue(`${cen}.finalidade`, c.finalidade_padrao ?? '');
      setValue(`${cen}.uf`, c.uf ?? '');
      setValue(`${cen}.contribuinte_icms`, c.contribuinte_icms == null ? '' : c.contribuinte_icms ? 'sim' : 'nao');
    }
    toast.success(`Perfil fiscal de ${c.nome} aplicado aos dois cenários`);
  };

  const origemDe = (campo: string) => ctx.defaults.find((d) => d.campo === campo)?.origem;
  const opcoesNcm = [
    { value: '', label: 'Selecione…' },
    ...ctx.ncms.map((n) => ({
      value: idNcm(n),
      label: `${n.ncm}${n.ex_tipi ? ' ' + n.ex_tipi : ''} — ${n.descricao} (IPI ${fmtPct(n.ipi_pct)}${n.monofasico ? ', monofásico' : ''}${n.provisorio ? ', provisório' : ''})`,
    })),
  ];

  const onCalcular = handleSubmit(
    (d) => {
      try {
        calcular.mutate(formParaPremissas(d, ctx));
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    () => toast.error('Há campos obrigatórios em branco ou inválidos.'),
  );
  const onSalvar = handleSubmit(
    (d) => salvar.mutate(d),
    () => toast.error('Há campos obrigatórios em branco ou inválidos.'),
  );

  if (projetoId != null && isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-muted-foreground">
        <Spinner /> <span className="text-sm">Carregando projeto…</span>
      </div>
    );
  }
  if (projetoId != null && (isError || !projeto)) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-error">Não foi possível carregar o projeto.</p>
        <Button variant="outline" size="sm" onClick={onVoltar}>Voltar à lista</Button>
      </div>
    );
  }

  const ocupado = calcular.isPending || salvar.isPending || recalcular.isPending;

  const renderCampo = (cen: 'ideal' | 'limite', def: DefCampo) => {
    const name = `${cen}.${def.campo}` as Path<FormValues>;
    const dica = cen === 'ideal' ? origemDe(def.campo) : undefined;
    if (def.tipo === 'txt') return <CampoTexto key={name} register={register} errors={errors} name={name} label={def.label} placeholder={def.placeholder} dica={dica} />;
    if (def.tipo === 'sel') {
      const opcoes = def.campo === 'ncm_id' ? opcoesNcm : def.opcoes;
      return <CampoSelect key={name} register={register} errors={errors} name={name} label={def.label} opcoes={opcoes} dica={dica} />;
    }
    return (
      <Campo key={name} register={register} errors={errors} name={name} label={def.label} sufixo={def.sufixo} step={def.step} placeholder={def.placeholder} dica={dica} />
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={projetoId == null ? 'Novo projeto de viabilidade' : projeto!.nome}
        description="Dois cenários lado a lado: a política vigente (ideal) e até onde podemos ir (limite)."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={onVoltar}>
              <ArrowLeft className="size-4" /> Lista
            </Button>
            {projetoId != null && isAdmin && (
              <Button variant="ghost" size="sm" className="text-error hover:bg-error-soft" onClick={() => setExcluindo(true)}>
                <Trash2 className="size-4" /> Excluir
              </Button>
            )}
          </>
        }
      />

      {/* -------- cabeçalho do projeto -------- */}
      <form className="space-y-4 rounded-lg border border-border bg-surface p-5" noValidate onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CampoTexto register={register} errors={errors} name="nome" label="Nome do projeto" placeholder="Ex.: Linha capilar — Cliente X" />
          <div className="space-y-1.5">
            <Label htmlFor="cliente_id">Cliente</Label>
            <select
              id="cliente_id"
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
              {...register('cliente_id', { onChange: (e) => aplicarPerfilDoCliente(e.target.value) })}
            >
              <option value="">Sem cliente</option>
              {ctx.clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <p className="text-caption text-warm-500">Escolher o cliente aplica o perfil fiscal dele aos dois cenários.</p>
          </div>
          <CampoSelect
            register={register}
            errors={errors}
            name="status"
            label="Status"
            opcoes={STATUS.map((s) => ({ value: s, label: s }))}
          />
          <div className="space-y-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Input id="observacoes" placeholder="Contexto, decisão, premissas do cliente…" {...register('observacoes')} />
          </div>
        </div>
        {projeto && (
          <p className="text-caption text-warm-500">
            Calculado em {fmtData(projeto.calculado_em)} · atualizado em {fmtData(projeto.updated_at)}
            {' · '}<Badge variant={BADGE_STATUS[projeto.status]}>{projeto.status}</Badge>
          </p>
        )}
      </form>

      {/* -------- premissas em duas colunas -------- */}
      <form className="space-y-4 rounded-lg border border-border bg-surface p-5" noValidate onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-ink">Cenário ideal</h3>
            <p className="text-caption text-warm-500">Política vigente: escada de margem, taxa de gestão, créditos e fábrica da vigência.</p>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-medium text-ink">Até onde podemos ir</h3>
              <p className="text-caption text-warm-500">As mesmas premissas com os ajustes (margem menor, preço imposto, volume, HE).</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={copiarDoIdeal}>
              <Copy className="size-4" /> Copiar do ideal
            </Button>
          </div>
        </div>

        {SECOES.map((s) => (
          <div key={s.titulo} className="space-y-3 border-t border-border/60 pt-4">
            <div>
              <h4 className="text-sm font-medium text-ink">{s.titulo}</h4>
              {s.descricao && <p className="text-caption text-warm-500">{s.descricao}</p>}
            </div>
            {s.campos.map((def) => (
              <div key={def.campo} className="grid grid-cols-2 gap-6">
                {renderCampo('ideal', def)}
                {renderCampo('limite', def)}
              </div>
            ))}
          </div>
        ))}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
          {desatualizado && (
            <span className="mr-auto text-caption text-warning">Premissas alteradas desde o último cálculo — o resultado abaixo está desatualizado.</span>
          )}
          {projetoId != null && (
            <Button type="button" variant="ghost" disabled={ocupado} onClick={() => recalcular.mutate()}>
              {recalcular.isPending ? <Spinner /> : <RefreshCw className="size-4" />} Recalcular com a vigência de hoje
            </Button>
          )}
          <Button type="button" variant="outline" disabled={ocupado} onClick={onCalcular}>
            {calcular.isPending && <Spinner />} Calcular (sem salvar)
          </Button>
          <Button type="button" disabled={ocupado} onClick={onSalvar}>
            {salvar.isPending && <Spinner className="text-sand" />} {projetoId == null ? 'Salvar e calcular' : 'Salvar e recalcular'}
          </Button>
        </div>
      </form>

      {/* -------- resultado -------- */}
      {!resultado ? (
        <p className="rounded-lg border border-dashed border-border bg-sand/40 p-5 text-sm text-muted-foreground">
          Sem resultado ainda. Preencha as premissas e clique em Calcular.
        </p>
      ) : (
        <div className={cn('space-y-6', desatualizado && 'opacity-70')}>
          <TabelaEspelho r={resultado} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CardCenario r={resultado.ideal} titulo="Cenário ideal" />
            <CardCenario r={resultado.limite} titulo="Até onde podemos ir" />
          </div>
          <TabelaDre r={resultado} />
          <Rastreabilidade r={resultado} />
        </div>
      )}

      <ConfirmDialog
        open={excluindo}
        onClose={() => setExcluindo(false)}
        onConfirm={() => remover.mutate()}
        loading={remover.isPending}
        destructive
        title="Excluir projeto de viabilidade"
        confirmLabel="Excluir"
        description={
          <>
            Tem certeza que deseja excluir <strong className="text-ink">{projeto?.nome}</strong>? Esta ação não pode ser desfeita.
          </>
        }
      />
    </div>
  );
}

// ================================= LISTA =================================

function Lista({ onAbrir, onNovo }: { onAbrir: (id: number) => void; onNovo: () => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['viabilidade', 'lista'],
    queryFn: () => viabilidadeApi.listar(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Análise de viabilidade de projetos"
        description="Projeto ímpar avaliado linha a linha: preço, tributos, margens, tempo de linha, produção mínima, investimento e hora extra."
        actions={
          <Button onClick={onNovo}>
            <Plus className="size-4" /> Novo projeto
          </Button>
        }
      />

      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <Spinner /> <span className="text-sm">Carregando projetos…</span>
        </div>
      )}
      {isError && (
        <div className="space-y-2 py-4">
          <p className="text-sm text-error">Não foi possível carregar os projetos.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      )}
      {!isLoading && !isError && (data ?? []).length === 0 && (
        <p className="rounded-lg border border-dashed border-border bg-sand/40 p-5 text-sm text-muted-foreground">
          Nenhum projeto de viabilidade ainda. Clique em "Novo projeto".
        </p>
      )}

      {(data ?? []).length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-caption text-warm-500">
                <th className="py-2 pr-4">Projeto</th>
                <th className="py-2 pr-4">Cliente</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Preço ideal (s/ IPI)</th>
                <th className="py-2 pr-4 text-right">Preço limite (s/ IPI)</th>
                <th className="py-2 pr-4 text-right">Lucro/mês ideal</th>
                <th className="py-2 pr-4 text-right">Lucro/mês limite</th>
                <th className="py-2">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id} className="cursor-pointer border-b border-border/50 hover:bg-warm-50/60" onClick={() => onAbrir(p.id)}>
                  <td className="py-2 pr-4 font-medium text-ink">
                    {p.nome}
                    {(p.resumo.ideal?.bloqueado || p.resumo.limite?.bloqueado) && (
                      <Badge variant="error" className="ml-2">bloqueado</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-warm-700">{p.cliente_nome ?? '—'}</td>
                  <td className="py-2 pr-4"><Badge variant={BADGE_STATUS[p.status]}>{p.status}</Badge></td>
                  <td className="py-2 pr-4 text-right tnum">{p.resumo.ideal ? fmtBRL(p.resumo.ideal.preco_sipi) : 'sem cálculo'}</td>
                  <td className="py-2 pr-4 text-right tnum">{p.resumo.limite ? fmtBRL(p.resumo.limite.preco_sipi) : 'sem cálculo'}</td>
                  <td className={cn('py-2 pr-4 text-right tnum', p.resumo.ideal && p.resumo.ideal.lucro_mes < 0 && 'text-error')}>
                    {p.resumo.ideal ? fmtBRL(p.resumo.ideal.lucro_mes) : '—'}
                  </td>
                  <td className={cn('py-2 pr-4 text-right tnum', p.resumo.limite && p.resumo.limite.lucro_mes < 0 && 'text-error')}>
                    {p.resumo.limite ? fmtBRL(p.resumo.limite.lucro_mes) : '—'}
                  </td>
                  <td className="py-2 whitespace-nowrap text-warm-700">{fmtData(p.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ================================ PÁGINA ================================

/** Mensagem de acesso restrito (padrão da Matriz de Custo). */
function AcessoRestrito() {
  return (
    <div className="space-y-4">
      <PageHeader title="Análise de viabilidade" />
      <p className="text-sm text-muted-foreground">Acesso restrito.</p>
    </div>
  );
}

export default function Viabilidade() {
  const { user } = useAuth();
  // GATE otimista (UX): a autoridade real é o AcessoCustoGuard no backend.
  const liberado = !!user && (user.pode_ver_custos || user.role === 'admin');

  const [tela, setTela] = useState<{ modo: 'lista' } | { modo: 'editor'; id: number | null }>({ modo: 'lista' });

  const { data: ctx, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['viabilidade', 'contexto'],
    queryFn: () => viabilidadeApi.contexto(),
    enabled: liberado,
  });

  if (!liberado) return <AcessoRestrito />;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-muted-foreground">
        <Spinner /> <span className="text-sm">Carregando parâmetros vigentes…</span>
      </div>
    );
  }
  if (isError || !ctx) {
    const status = (error as AxiosError | null)?.response?.status;
    if (status === 401 || status === 403) return <AcessoRestrito />;
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-error">Não foi possível carregar o contexto da viabilidade.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  const bannerErro = ctx.erro && (
    <div className="rounded-md border border-error bg-error-soft px-4 py-3 text-sm text-error">
      <span className="font-semibold">Parâmetros vigentes incompletos — não é possível calcular.</span> {ctx.erro}
    </div>
  );

  if (tela.modo === 'lista') {
    return (
      <div className="space-y-4">
        {bannerErro}
        <Lista onAbrir={(id) => setTela({ modo: 'editor', id })} onNovo={() => setTela({ modo: 'editor', id: null })} />
        {ctx.parametros && (
          <p className="text-caption text-warm-500">
            Fábrica vigente: taxa {fmtBRL(ctx.parametros.derivados.taxa_minuto)}/min · setup {fmtBRL(ctx.parametros.derivados.custo_setup_ordem)}/ordem · capacidade{' '}
            {fmtN(ctx.parametros.derivados.capacidade_normal_min_mes, 0)} min/mês · escada {ctx.parametros.escada.lote_pequeno_pct}/{ctx.parametros.escada.lote_medio_pct}/
            {ctx.parametros.escada.lote_grande_pct}% · lote mínimo {ctx.parametros.lote_minimo_un} un.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bannerErro}
      <Editor
        key={tela.id ?? 'novo'}
        projetoId={tela.id}
        ctx={ctx}
        onVoltar={() => setTela({ modo: 'lista' })}
        onCriado={(id) => setTela({ modo: 'editor', id })}
      />
    </div>
  );
}
