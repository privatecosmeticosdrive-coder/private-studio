/**
 * SEED — MOTOR 2 10/26: vigência 2026-10-01 dos parâmetros versionados.
 *
 * IDEMPOTENTE: para cada chave, só grava se ainda NÃO existe linha com
 * vigencia_inicio = 2026-10-01. A vigência aberta anterior da mesma chave é
 * ENCERRADA em 2026-09-30 (nunca editada in-row — mudar parâmetro é criar nova
 * vigência). Roda em DRY-RUN por padrão; `--commit` grava.
 *
 *   node prisma/seed-motor2-2026-10.cjs            # mostra o plano
 *   node prisma/seed-motor2-2026-10.cjs --commit   # aplica
 *
 * NUNCA rodar contra produção sem OK do dono (regra 3 do CLAUDE.md). Rollback
 * dos dados: prisma/rollback-motor2-2026-10.sql (untracked).
 *
 * Fontes (auditoria financeira 19–20/10/2026, BPO Central Financeira):
 *  - custo_fixo_producao_mensal 101.305 = folha de produção + logística como
 *    efetivamente paga + GPS/FGTS/13º como pagos + 85% de aluguel e energia +
 *    água + manutenção + análises de laboratório (folha de 20/10/2026). SEM
 *    encargos simulados, SEM ociosidade, SEM SG&A (CPC 16 item 13).
 *  - créditos 21,21% (MP) e 13,82% (embalagem) = ICMS + PIS/COFINS + IPI
 *    recuperáveis medidos nas NFs de entrada de 2026.
 *  - escada 45/40/35, lote mínimo 500, taxa de gestão 15%, un_min padrão 6 =
 *    política comercial validada pelo dono em 20/10/2026.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const COMMIT = process.argv.includes('--commit');
const VIGENCIA = new Date('2026-10-01');
const FIM_ANTERIOR = new Date('2026-09-30');

const FONTE = 'Auditoria financeira 19-20/10/2026 (BPO Central Financeira) — Motor 2 10/26. ';

// ---- parametro_producao (fábrica + política) ----
const PRODUCAO = [
  ['custo_fixo_producao_mensal', 101305, 'MEDIDO: folha producao+logistica paga + GPS/FGTS/13o pagos + 85% aluguel/energia + agua + manutencao + analises lab (folha 20/10/2026). Sem encargos simulados, sem ociosidade, sem SG&A (CPC 16 item 13).'],
  ['linhas_paralelas', 2.5, 'CONFIRMADO pelo dono (mantido da rodada 2).'],
  ['eficiencia_producao', 0.82, 'MANTIDO da rodada 2 (75% + 6,8% de setup explicito).'],
  ['setup_minutos', 60, 'MANTIDO: 1h por troca de SKU (estimativa global).'],
  ['dias_uteis_mes', 22, 'MEDIDO: padrao operacional vigente.'],
  ['horas_dia', 8, 'MEDIDO: turno unico de 8h.'],
  ['moq_economico_valor', 2400, 'POLITICA: custo do lote >= 2.400 faz o setup pesar <= 10%.'],
  // --- Motor 2: política comercial ---
  ['motor_precificacao', 2, 'SELETOR DO MOTOR: 2 = Motor 2 10/26 (1 = fiscal granular 3.1). Snapshots antigos nao sao afetados.'],
  ['taxa_gestao_embalagem_pct', 15, 'POLITICA: embalagem de repasse NAO leva a margem do produto; recebe taxa de gestao de 15% grossada com os mesmos tributos por dentro.'],
  ['margem_lote_pequeno_pct', 45, 'POLITICA (escada de margem): lote < lote_medio_min_un.'],
  ['margem_lote_medio_pct', 40, 'POLITICA (escada de margem): lote_medio_min_un <= lote < lote_grande_min_un.'],
  ['margem_lote_grande_pct', 35, 'POLITICA (escada de margem): lote >= lote_grande_min_un.'],
  ['lote_medio_min_un', 1000, 'POLITICA (escada de margem): inicio da faixa media.'],
  ['lote_grande_min_un', 5000, 'POLITICA (escada de margem): inicio da faixa grande.'],
  ['lote_minimo_un', 500, 'POLITICA: lote minimo aceito. Abaixo disso o calculo sai com alerta BLOQUEANTE (preco so para referencia).'],
  ['un_min_padrao', 6, 'POLITICA: velocidade padrao (un/min) quando o orcamento nao informa un_min — aplicada COM alerta visivel, nunca em silencio.'],
];

// ---- parametro_fiscal (créditos medidos) ----
const FISCAL = [
  ['credito_mp_pct', 21.21, 'Creditos recuperaveis (ICMS + PIS/COFINS + IPI) MEDIDOS nas NFs de entrada de materia-prima de 2026 — Lucro Real, nao cumulativo.'],
  ['credito_emb_pct', 13.82, 'Creditos recuperaveis (ICMS + PIS/COFINS + IPI) MEDIDOS nas NFs de entrada de embalagens de 2026 — Lucro Real, nao cumulativo.'],
];

async function planoParaTabela(nome, delegate, linhas, campoFonte) {
  const plano = [];
  for (const [chave, valor, compl] of linhas) {
    const jaTem = await delegate.findFirst({ where: { chave, vigencia_inicio: VIGENCIA } });
    if (jaTem) {
      plano.push({ tabela: nome, chave, acao: 'PULA', motivo: `ja existe vigencia 2026-10-01 (id=${jaTem.id}, valor=${jaTem.valor})` });
      continue;
    }
    // Vigencia aberta POSTERIOR ja cadastrada pelo admin: a seed NAO cria uma
    // segunda linha aberta (red team M4) - pula e avisa.
    const posterior = await delegate.findFirst({ where: { chave, vigencia_fim: null, vigencia_inicio: { gte: VIGENCIA } } });
    if (posterior) {
      plano.push({ tabela: nome, chave, acao: 'PULA', motivo: `ja existe vigencia aberta posterior (id=${posterior.id}, inicio ${posterior.vigencia_inicio.toISOString().slice(0, 10)}, valor=${posterior.valor})` });
      continue;
    }
    const aberta = await delegate.findFirst({
      where: { chave, vigencia_fim: null, vigencia_inicio: { lt: VIGENCIA } },
      orderBy: { vigencia_inicio: 'desc' },
    });
    plano.push({
      tabela: nome,
      chave,
      acao: 'GRAVA',
      valor,
      encerra: aberta ? { id: aberta.id, valor_anterior: String(aberta.valor) } : null,
      data: { chave, valor, vigencia_inicio: VIGENCIA, [campoFonte]: `${FONTE}${compl}` },
    });
  }
  return plano;
}

(async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'admin', ativo: true }, select: { id: true } });
  const plano = [
    ...(await planoParaTabela('parametro_producao', prisma.parametroProducao, PRODUCAO, 'fonte')),
    ...(await planoParaTabela('parametro_fiscal', prisma.parametroFiscal, FISCAL, 'fundamento_legal')),
  ];

  console.log(`PLANO (${COMMIT ? 'COMMIT' : 'DRY-RUN'}): ${plano.length} chaves`);
  for (const p of plano) {
    if (p.acao === 'PULA') console.log(`  PULA  ${p.tabela}.${p.chave} — ${p.motivo}`);
    else
      console.log(
        `  GRAVA ${p.tabela}.${p.chave} = ${p.valor}` +
          (p.encerra ? ` (encerra id=${p.encerra.id}, era ${p.encerra.valor_anterior}, em 2026-09-30)` : ' (sem vigencia anterior)'),
      );
  }

  if (!COMMIT) {
    console.log('\nDRY-RUN — nada gravado. Rode com --commit para aplicar.');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const p of plano) {
      if (p.acao !== 'GRAVA') continue;
      const delegate = p.tabela === 'parametro_producao' ? tx.parametroProducao : tx.parametroFiscal;
      if (p.encerra) await delegate.update({ where: { id: p.encerra.id }, data: { vigencia_fim: FIM_ANTERIOR } });
      await delegate.create({ data: { ...p.data, criado_por: admin?.id ?? null } });
    }
  });
  console.log(`\nAPLICADO. Rollback dos dados: prisma/rollback-motor2-2026-10.sql`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
