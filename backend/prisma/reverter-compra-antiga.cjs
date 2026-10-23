/**
 * REGRA NOVA (23/10/2026): a compra do Omie so substitui o preco da MP quando a NF e MAIS RECENTE
 * que a cotacao que estava no Studio. Este script desfaz, a partir do BACKUP de uma sincronizacao ja
 * aplicada, os precos que entraram por uma compra de data IGUAL ou MAIS ANTIGA que a cotacao anterior.
 *
 *   node prisma/reverter-compra-antiga.cjs --backup=prisma/backup-sync-omie-mp-<ts>.json            # DRY-RUN (lista)
 *   node prisma/reverter-compra-antiga.cjs --backup=prisma/backup-sync-omie-mp-<ts>.json --commit   # aplica
 *
 * Para cada MP do backup (retrato de ANTES da sincronizacao) com cotacao anterior datada:
 *   - acha o historico criado pela sincronizacao (origem integracao_omie, id acima do maximo de antes);
 *   - se a data da compra <= data da cotacao anterior: volta preco/preco_anterior/aumento/fornecedor/data/flag
 *     ao retrato, apaga esse historico e o alerta de aumento que ele gerou, e registra no audit_log.
 * MPs que a sincronizacao CRIOU nao sao tocadas (nao havia cotacao anterior). Idempotente.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const COMMIT = argv.includes('--commit');
const arq = (argv.find((a) => a.startsWith('--backup=')) ?? '').slice(9);
if (!arq) throw new Error('informe --backup=<arquivo>');
const b = JSON.parse(fs.readFileSync(arq, 'utf8'));
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const num = (v) => (v == null ? null : Number(v));

(async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'admin', ativo: true }, select: { id: true } });
  const ids = b.materias_primas_antes.map((m) => m.id);
  const [atuais, hist] = await Promise.all([
    prisma.materiaPrima.findMany({ where: { id: { in: ids } } }),
    prisma.mpHistoricoPreco.findMany({ where: { mp_id: { in: ids }, origem: 'integracao_omie', id: { gt: b.max_ids_antes.mp_historico_precos } }, orderBy: { id: 'desc' } }),
  ]);
  const atualPorId = new Map(atuais.map((m) => [m.id, m]));
  const histPorMp = new Map();
  for (const h of hist) if (!histPorMp.has(h.mp_id)) histPorMp.set(h.mp_id, h);

  const plano = [];
  for (const antes of b.materias_primas_antes) {
    const h = histPorMp.get(antes.id);
    const agora = atualPorId.get(antes.id);
    if (!h || !agora) continue; // ja revertida ou sem preco aplicado
    const dataCot = iso(antes.data_cotacao);
    const dataCompra = iso(h.data_cotacao);
    if (!dataCot || dataCompra > dataCot) continue; // compra mais recente: regra nova mantem
    plano.push({ antes, agora, h, dataCot, dataCompra });
  }
  console.log(`MPs do backup: ${ids.length} | a reverter (compra <= cotacao anterior): ${plano.length}`);
  for (const p of plano.slice(0, 40)) console.log(`  ${p.antes.codigo} ${p.antes.nome}: R$ ${num(p.agora.preco_kg_brl)} (${iso(p.agora.data_cotacao)}) -> volta a R$ ${num(p.antes.preco_kg_brl)} (${p.dataCot})`);
  if (plano.length > 40) console.log(`  ... e mais ${plano.length - 40}`);
  if (!COMMIT) { console.log('\nDRY-RUN — nada gravado. Rode com --commit para aplicar.'); await prisma.$disconnect(); return; }

  let alertas = 0;
  await prisma.$transaction(async (tx) => {
    for (const p of plano) {
      const a = p.antes;
      await tx.materiaPrima.update({ where: { id: a.id }, data: { preco_kg_brl: a.preco_kg_brl, preco_anterior: a.preco_anterior, aumento_pct: a.aumento_pct, fornecedor: a.fornecedor, data_cotacao: a.data_cotacao ? new Date(a.data_cotacao) : null, flag_aumento_relevante: a.flag_aumento_relevante } });
      await tx.mpHistoricoPreco.delete({ where: { id: p.h.id } });
      const del = await tx.alerta.deleteMany({ where: { id: { gt: b.max_ids_antes.alertas }, tipo: 'aumento_mp', entidade_tipo: 'mp', entidade_id: a.id, mensagem: { contains: 'ultima compra no Omie' } } });
      alertas += del.count;
      await tx.auditLog.create({ data: { user_id: admin?.id ?? null, acao: 'integracao_omie_reverter_compra_antiga', entidade: 'materia_prima', entidade_id: String(a.codigo), detalhes: { de: num(p.agora.preco_kg_brl), para: num(a.preco_kg_brl), data_compra: p.dataCompra, data_cotacao_mantida: p.dataCot, regra: 'compra so substitui quando mais recente que a cotacao (23/10/2026)' } } });
    }
  }, { timeout: 10 * 60 * 1000 });
  console.log(`\nAPLICADO: ${plano.length} MPs voltaram a cotacao anterior; ${alertas} alertas de aumento removidos.`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
