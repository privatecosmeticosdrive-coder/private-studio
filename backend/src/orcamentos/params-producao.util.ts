/**
 * Leitura dos parâmetros de PRODUÇÃO vigentes (tabela parametro_producao) —
 * modelo de MO de 3 componentes, rodada 2. Mesma disciplina do fiscal:
 * FALHA VISÍVEL (regra 6) quando falta chave — nunca custo de MO silencioso.
 *
 * Os DERIVADOS (taxa_minuto, capacidade, custo_setup_ordem, minutos produtivos)
 * NÃO moram aqui nem no banco: são recomputados por `calcularCustoProducao`
 * a partir destes parâmetros, a cada cálculo.
 */
import type { PrismaService } from '../prisma/prisma.service';
import type { ParametrosProducao } from './custo-producao.util';

const CHAVES_OBRIGATORIAS = [
  'custo_fixo_producao_mensal',
  'linhas_paralelas',
  'eficiencia_producao',
  'setup_minutos',
  'dias_uteis_mes',
  'horas_dia',
] as const;

export async function lerParametrosProducaoVigentes(
  prisma: PrismaService,
  hoje = new Date(),
): Promise<ParametrosProducao> {
  const rows = await prisma.parametroProducao.findMany({
    where: {
      vigencia_inicio: { lte: hoje },
      OR: [{ vigencia_fim: null }, { vigencia_fim: { gte: hoje } }],
    },
    orderBy: { vigencia_inicio: 'desc' },
  });

  const vigente = new Map<string, number>();
  for (const r of rows) {
    if (!vigente.has(r.chave)) vigente.set(r.chave, Number(r.valor));
  }

  const faltando = CHAVES_OBRIGATORIAS.filter((c) => !vigente.has(c));
  if (faltando.length > 0) {
    throw new Error(
      `Parametros de producao sem vigencia ativa: ${faltando.join(', ')}. ` +
        'Cadastre a vigencia em parametro_producao antes de calcular (regra 6: nao se estima custo de producao).',
    );
  }

  return {
    custo_fixo_producao_mensal: vigente.get('custo_fixo_producao_mensal')!,
    linhas_paralelas: vigente.get('linhas_paralelas')!,
    eficiencia_producao: vigente.get('eficiencia_producao')!,
    setup_minutos: vigente.get('setup_minutos')!,
    dias_uteis_mes: vigente.get('dias_uteis_mes')!,
    horas_dia: vigente.get('horas_dia')!,
    // POLÍTICA (não é custo): usada só no alerta de MOQ. Ausência não impede
    // calcular — o alerta cai para o critério do teto de setup.
    moq_economico_valor: vigente.get('moq_economico_valor'),
  };
}
