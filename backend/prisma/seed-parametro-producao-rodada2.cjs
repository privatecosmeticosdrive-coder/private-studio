/**
 * SEED — parametro_producao, vigência rodada 2 (ago/2026).
 * Idempotente: só grava se a chave não tem vigência aberta. Roda com
 * `node prisma/seed-parametro-producao-rodada2.cjs` a partir de backend/.
 *
 * Fonte dos números: levantamento do agente financeiro, RODADA 2 (ago/2026),
 * auditado e reconciliado. NÃO alterar valor aqui sem nova rodada — mudar
 * parâmetro é criar NOVA vigência (fechar a anterior), nunca editar in-row.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FONTE_BASE =
  'Levantamento do agente financeiro, rodada 2, ago/2026 — extrato ARTTA jun-jul/26, ' +
  'folha com centro de custo, 19 meses de faturamento, entradas por CFOP.';

// [chave, valor, complemento de fonte]
const PARAMS = [
  ['custo_fixo_producao_mensal', 83084, 'MEDIDO: 77.984 (medido) + 5.100 depreciacao estimada (CAPEX 368.758 a 10%/ano, rateio 85% producao). Exclui ociosidade e SG&A (CPC 16 item 13).'],
  ['linhas_paralelas', 2.5, 'MEDIDO/CONFIRMADO: deduzido por impossibilidade aritmetica (6 de 19 meses davam >100% com 1 linha) e confirmado pelo dono.'],
  ['eficiencia_producao', 0.82, 'PROVISORIO: 75% original + 6,8% de setup agora explicito (evita dupla contagem da parada). Deriva de ~30 ordens/mes ESTIMADAS — aguarda o numero real de ordens/mes do ERP.'],
  ['setup_minutos', 60, 'PROVISORIO: estimativa GLOBAL (1h/troca de SKU) — aguarda medicao por familia de produto.'],
  ['dias_uteis_mes', 22, 'MEDIDO: padrao operacional vigente (mesmo da system_config).'],
  ['horas_dia', 8, 'MEDIDO: turno unico de 8h (mesmo da system_config).'],
  ['moq_economico_valor', 2400, 'DERIVADO DA POLITICA: custo do lote >= 2.400 faz o setup pesar <=10%. Politica comercial, nao medicao.'],
];

(async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'admin', ativo: true }, select: { id: true } });
  const vigencia = new Date('2026-08-01'); // vigência da rodada 2
  let gravados = 0, pulados = 0;
  for (const [chave, valor, compl] of PARAMS) {
    const aberta = await prisma.parametroProducao.findFirst({
      where: { chave, vigencia_fim: null },
    });
    if (aberta) {
      console.log(`  PULA  ${chave} — já tem vigência aberta (id=${aberta.id}, valor=${aberta.valor})`);
      pulados++;
      continue;
    }
    await prisma.parametroProducao.create({
      data: {
        chave,
        valor,
        vigencia_inicio: vigencia,
        fonte: `${FONTE_BASE} ${compl}`,
        criado_por: admin?.id ?? null,
      },
    });
    console.log(`  GRAVA ${chave} = ${valor}`);
    gravados++;
  }
  console.log(`\nseed: ${gravados} gravados, ${pulados} pulados`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
