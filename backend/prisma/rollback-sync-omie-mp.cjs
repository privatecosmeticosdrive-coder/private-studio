/**
 * ROLLBACK de uma sincronizacao Omie -> Studio (prisma/sync-omie-mp.cjs --commit).
 *   node prisma/rollback-sync-omie-mp.cjs --backup=prisma/backup-sync-omie-mp-<ts>.json [--commit]
 * Desfaz, a partir do backup gerado pela propria sincronizacao:
 *  - precos/fornecedor/data/flag das MPs afetadas (voltam ao retrato de antes);
 *  - historico de precos, alertas e audit_log criados pela sincronizacao (ids acima do maximo de antes,
 *    filtrados por origem/acao da integracao — nunca apaga registro de outra origem);
 *  - MPs criadas do Omie (so se nenhuma formula passou a usa-las);
 *  - mp_omie_vinculos: volta ao conjunto de antes.
 * DRY-RUN por padrao.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const COMMIT = argv.includes('--commit');
const arq = (argv.find((a) => a.startsWith('--backup=')) ?? '').slice(9);
if (!arq) throw new Error('informe --backup=<arquivo>');
const b = JSON.parse(fs.readFileSync(arq, 'utf8'));

(async () => {
  const novas = await prisma.materiaPrima.findMany({ where: { codigo: { in: b.mps_novas_codigos } }, include: { _count: { select: { composicoes: true } } } });
  const usadas = novas.filter((m) => m._count.composicoes > 0);
  const hist = await prisma.mpHistoricoPreco.count({ where: { id: { gt: b.max_ids_antes.mp_historico_precos }, origem: 'integracao_omie' } });
  const alertas = await prisma.alerta.count({ where: { id: { gt: b.max_ids_antes.alertas }, tipo: 'aumento_mp', mensagem: { contains: 'ultima compra no Omie' } } });
  const audit = await prisma.auditLog.count({ where: { id: { gt: b.max_ids_antes.audit_log }, acao: { startsWith: 'integracao_omie' } } });
  console.log(`Plano: restaurar ${b.materias_primas_antes.length} MPs; apagar ${hist} historicos, ${alertas} alertas, ${audit} audits; apagar ${novas.length - usadas.length} MPs criadas (${usadas.length} ja usadas em formulas ficam); vinculos voltam a ${b.vinculos_antes.length}.`);
  if (!COMMIT) { console.log('DRY-RUN — nada feito. Use --commit.'); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx) => {
    for (const m of b.materias_primas_antes) {
      await tx.materiaPrima.update({ where: { id: m.id }, data: { preco_kg_brl: m.preco_kg_brl, preco_anterior: m.preco_anterior, aumento_pct: m.aumento_pct, fornecedor: m.fornecedor, data_cotacao: m.data_cotacao ? new Date(m.data_cotacao) : null, flag_aumento_relevante: m.flag_aumento_relevante } });
    }
    await tx.mpHistoricoPreco.deleteMany({ where: { id: { gt: b.max_ids_antes.mp_historico_precos }, origem: 'integracao_omie' } });
    await tx.alerta.deleteMany({ where: { id: { gt: b.max_ids_antes.alertas }, tipo: 'aumento_mp', mensagem: { contains: 'ultima compra no Omie' } } });
    await tx.auditLog.deleteMany({ where: { id: { gt: b.max_ids_antes.audit_log }, acao: { startsWith: 'integracao_omie' } } });
    await tx.mpOmieVinculo.deleteMany({});
    for (const v of b.vinculos_antes) { const { id, created_at, updated_at, ...data } = v; await tx.mpOmieVinculo.create({ data: { ...data, score: data.score, sincronizado_em: data.sincronizado_em ? new Date(data.sincronizado_em) : null } }); }
    const apagar = novas.filter((m) => m._count.composicoes === 0).map((m) => m.id);
    await tx.mpOmieVinculo.updateMany({ where: { mp_id: { in: apagar } }, data: { mp_id: null } });
    await tx.materiaPrima.deleteMany({ where: { id: { in: apagar } } });
  }, { timeout: 10 * 60 * 1000 });
  console.log('Rollback aplicado.');
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
