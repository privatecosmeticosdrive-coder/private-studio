/**
 * Leitura dos parâmetros do MOTOR 2 10/26 e da SELEÇÃO DO MOTOR.
 *
 * Onde mora cada coisa (mesma disciplina versionada já existente):
 *  - parametro_fiscal   → credito_mp_pct, credito_emb_pct (créditos medidos nas
 *                         NFs de entrada; têm fundamento + vigência).
 *  - parametro_producao → custo da fábrica (vigência 2026-10) + POLÍTICA comercial:
 *                         escada de margem, lote mínimo, taxa de gestão da
 *                         embalagem, un_min padrão e o seletor `motor_precificacao`.
 *  - system_config      → perda de MP (desvio_mp_pct) e frete/un (legado, editável
 *                         na Matriz de Custo > Operacional).
 *
 * FALHA VISÍVEL (regra 6): Motor 2 selecionado sem as chaves vigentes → erro
 * listando o que falta. Sem o seletor cadastrado, o padrão é o Motor 1 (o
 * comportamento de produção não muda até a seed da vigência 2026-10 rodar).
 */
import type { PrismaService } from '../prisma/prisma.service';
import type { ParametrosProducao } from './custo-producao.util';
import type { ParametrosMotor2 } from './custo-engine-motor2';

export type MotorPrecificacao = 1 | 2;

export const CHAVES_FISCAIS_MOTOR2 = [
  'credito_mp_pct',
  'credito_emb_pct',
] as const;

export const CHAVES_PRODUCAO_MOTOR2 = [
  'taxa_gestao_embalagem_pct',
  'margem_lote_pequeno_pct',
  'margem_lote_medio_pct',
  'margem_lote_grande_pct',
  'lote_medio_min_un',
  'lote_grande_min_un',
  'lote_minimo_un',
] as const;

/** chave opcional: velocidade padrão quando o orçamento não traz un_min. */
export const CHAVE_UN_MIN_PADRAO = 'un_min_padrao';
/** chave opcional: 1 ou 2. Ausente => 1 (Motor 1, comportamento anterior). */
export const CHAVE_MOTOR = 'motor_precificacao';

export interface VigenciaUsada {
  chave: string;
  valor: number;
  vigencia_inicio: string; // ISO date
  fonte: string;
}

async function vigentesProducao(prisma: PrismaService, hoje: Date) {
  const rows = await prisma.parametroProducao.findMany({
    where: {
      vigencia_inicio: { lte: hoje },
      OR: [{ vigencia_fim: null }, { vigencia_fim: { gte: hoje } }],
    },
    orderBy: { vigencia_inicio: 'desc' },
  });
  const vig = new Map<string, VigenciaUsada>();
  for (const r of rows) {
    if (!vig.has(r.chave)) {
      vig.set(r.chave, {
        chave: r.chave,
        valor: Number(r.valor),
        vigencia_inicio: r.vigencia_inicio.toISOString().slice(0, 10),
        fonte: r.fonte,
      });
    }
  }
  return vig;
}

async function vigentesFiscal(prisma: PrismaService, hoje: Date) {
  const rows = await prisma.parametroFiscal.findMany({
    where: {
      vigencia_inicio: { lte: hoje },
      OR: [{ vigencia_fim: null }, { vigencia_fim: { gte: hoje } }],
    },
    orderBy: { vigencia_inicio: 'desc' },
  });
  const vig = new Map<string, VigenciaUsada>();
  for (const r of rows) {
    if (!vig.has(r.chave)) {
      vig.set(r.chave, {
        chave: r.chave,
        valor: Number(r.valor),
        vigencia_inicio: r.vigencia_inicio.toISOString().slice(0, 10),
        fonte: r.fundamento_legal,
      });
    }
  }
  return vig;
}

/** Motor padrão do sistema (parametro_producao.motor_precificacao). Ausente => 1. */
export async function lerMotorPadrao(
  prisma: PrismaService,
  hoje = new Date(),
): Promise<MotorPrecificacao> {
  const vig = await vigentesProducao(prisma, hoje);
  const m = vig.get(CHAVE_MOTOR);
  return m && Number(m.valor) === 2 ? 2 : 1;
}

export interface ParametrosMotor2Lidos {
  params: ParametrosMotor2;
  /** velocidade padrão (un/min) para quando o orçamento não traz un_min; null = sem default. */
  un_min_padrao: number | null;
  /** vigências efetivamente usadas — gravadas no snapshot (rastreabilidade). */
  vigencias: VigenciaUsada[];
}

export async function lerParametrosMotor2(
  prisma: PrismaService,
  producao: ParametrosProducao,
  legado: { perda_mp_pct: number; frete_un_brl: number },
  hoje = new Date(),
): Promise<ParametrosMotor2Lidos> {
  const [vp, vf] = await Promise.all([
    vigentesProducao(prisma, hoje),
    vigentesFiscal(prisma, hoje),
  ]);

  const faltando = [
    ...CHAVES_FISCAIS_MOTOR2.filter((c) => !vf.has(c)).map(
      (c) => `parametro_fiscal.${c}`,
    ),
    ...CHAVES_PRODUCAO_MOTOR2.filter((c) => !vp.has(c)).map(
      (c) => `parametro_producao.${c}`,
    ),
  ];
  if (faltando.length > 0) {
    throw new Error(
      `Motor 2 10/26 sem parâmetros vigentes: ${faltando.join(', ')}. ` +
        'Rode a seed da vigência 2026-10 (prisma/seed-motor2-2026-10.cjs) ou cadastre as vigências em Matriz de Custo.',
    );
  }

  const f = (c: string) => vf.get(c)!.valor;
  const p = (c: string) => vp.get(c)!.valor;

  const params: ParametrosMotor2 = {
    producao,
    perda_mp_pct: legado.perda_mp_pct,
    frete_un_brl: legado.frete_un_brl,
    credito_mp_pct: f('credito_mp_pct'),
    credito_emb_pct: f('credito_emb_pct'),
    taxa_gestao_embalagem_pct: p('taxa_gestao_embalagem_pct'),
    escada: {
      lote_pequeno_pct: p('margem_lote_pequeno_pct'),
      lote_medio_pct: p('margem_lote_medio_pct'),
      lote_grande_pct: p('margem_lote_grande_pct'),
      lote_medio_min_un: p('lote_medio_min_un'),
      lote_grande_min_un: p('lote_grande_min_un'),
    },
    lote_minimo_un: p('lote_minimo_un'),
  };

  const unMin = vp.get(CHAVE_UN_MIN_PADRAO);
  const vigencias: VigenciaUsada[] = [
    ...CHAVES_FISCAIS_MOTOR2.map((c) => vf.get(c)!),
    ...CHAVES_PRODUCAO_MOTOR2.map((c) => vp.get(c)!),
    ...(unMin ? [unMin] : []),
    // fábrica: as chaves do modelo de 3 componentes também entram na rastreabilidade
    ...[
      'custo_fixo_producao_mensal',
      'linhas_paralelas',
      'eficiencia_producao',
      'setup_minutos',
      'dias_uteis_mes',
      'horas_dia',
      'moq_economico_valor',
    ]
      .map((c) => vp.get(c))
      .filter((v): v is VigenciaUsada => !!v),
  ];

  return { params, un_min_padrao: unMin ? unMin.valor : null, vigencias };
}
