/**
 * Leitura dos parâmetros fiscais VIGENTES (tabela parametro_fiscal) para a
 * matriz fiscal (F4 Fase A). FALHA VISÍVEL (regra 6): chave obrigatória sem
 * vigência ativa -> exception com a lista do que falta — nunca imposto 0
 * silencioso.
 */
import type { PrismaService } from '../prisma/prisma.service';
import type { ParametrosFiscaisVigentes, CaracterizacaoFiscal } from './matriz-fiscal.util';

const CHAVES_OBRIGATORIAS = [
  'pis_monofasico_pct',
  'cofins_monofasico_pct',
  'pis_comum_pct',
  'cofins_comum_pct',
  'icms_carga_art34_pct',
  'icms_nominal_padrao_pct',
] as const;

export async function lerParametrosFiscaisVigentes(
  prisma: PrismaService,
  hoje = new Date(),
): Promise<{ params: ParametrosFiscaisVigentes; caracterizacao: CaracterizacaoFiscal }> {
  const rows = await prisma.parametroFiscal.findMany({
    where: {
      vigencia_inicio: { lte: hoje },
      OR: [{ vigencia_fim: null }, { vigencia_fim: { gte: hoje } }],
    },
    orderBy: { vigencia_inicio: 'desc' },
  });

  const vigente = new Map<string, { valor: number; fundamento: string }>();
  for (const r of rows) {
    if (!vigente.has(r.chave)) {
      vigente.set(r.chave, { valor: Number(r.valor), fundamento: r.fundamento_legal });
    }
  }

  const faltando = CHAVES_OBRIGATORIAS.filter((c) => !vigente.has(c));
  if (faltando.length > 0) {
    throw new Error(
      `Parâmetros fiscais sem vigência ativa: ${faltando.join(', ')}. ` +
        'Cadastre em Matriz de Custo > Parâmetros fiscais antes de calcular.',
    );
  }

  const v = (c: string) => vigente.get(c)!.valor;
  const params: ParametrosFiscaisVigentes = {
    pis_monofasico_pct: v('pis_monofasico_pct'),
    cofins_monofasico_pct: v('cofins_monofasico_pct'),
    pis_comum_pct: v('pis_comum_pct'),
    cofins_comum_pct: v('cofins_comum_pct'),
    icms_carga_art34_pct: v('icms_carga_art34_pct'),
    icms_nominal_padrao_pct: v('icms_nominal_padrao_pct'),
  };

  // Flag jurídica (A3): opt-in documentado. AUSENTE => OFF (default conservador
  // — este é um default de COMPORTAMENTO documentado, não um imposto zerado).
  const flag = vigente.get('industrializacao_caracterizada');
  const caracterizacao: CaracterizacaoFiscal = flag
    ? { industrializacao_caracterizada: flag.valor === 1, fundamento: flag.fundamento }
    : { industrializacao_caracterizada: false };

  return { params, caracterizacao };
}
