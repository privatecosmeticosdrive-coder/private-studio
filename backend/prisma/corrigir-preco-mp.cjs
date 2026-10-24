/**
 * Correcao pontual de preco de MP com a mesma trilha da tela "Atualizar preco"
 * (MateriasPrimasService.atualizarPreco): historico + update da MP + audit_log.
 *   node prisma/corrigir-preco-mp.cjs            # mostra o plano
 *   node prisma/corrigir-preco-mp.cjs --commit   # grava
 * 24/10/2026 — a pedido do dono: D'Pantenol e Tartrazina tinham cotacao digitada errada
 * (R$ 522,60 e R$ 350,00); valem as ultimas NFs de compra no Omie.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');

const CORRECOES = [
  { codigo: 143, esperado: 'Pantenol', preco: 49, data: '2024-07-12', fornecedor: 'MUNDIQUIMICA COMERCIO, IMPORTACAO E EXPORTACAO LTDA', obs: "Correcao 24/10/2026 (dono): cotacao R$ 522,60 era erro de digitacao. Ultima compra: NF 9455 de 12/07/2024, 10 KG a R$ 49,00/KG (Omie PRD00724)." },
  { codigo: 1238, esperado: 'Tartrazina', preco: 9.9286, data: '2024-10-28', fornecedor: 'OSVALDO PEDROSA PEREIRA JUNIOR - CORANTES', obs: 'Correcao 24/10/2026 (dono): cotacao R$ 350,00 era erro. Ultima compra: NF 15562 de 28/10/2024, 0,7 KG por R$ 6,95 (R$ 9,9286/KG) (Omie PRD01636).' },
];

(async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'admin', ativo: true }, select: { id: true } });
  const plano = [];
  for (const c of CORRECOES) {
    const mp = await prisma.materiaPrima.findUnique({ where: { codigo: c.codigo } });
    if (!mp) throw new Error(`MP ${c.codigo} nao encontrada`);
    if (!mp.nome.toLowerCase().includes(c.esperado.toLowerCase())) throw new Error(`MP ${c.codigo} e "${mp.nome}", esperado ${c.esperado} — abortado`);
    const atual = mp.preco_kg_brl != null ? Number(mp.preco_kg_brl) : null;
    const variacao = atual ? Number((((c.preco - atual) / atual) * 100).toFixed(2)) : null;
    plano.push({ mp, c, atual, variacao });
    console.log(`${mp.codigo} ${mp.nome}: R$ ${atual} (${mp.data_cotacao?.toISOString().slice(0, 10)}) -> R$ ${c.preco} (${c.data}) ${variacao}%`);
  }
  if (!COMMIT) { console.log('\nPLANO — nada gravado. Use --commit.'); await prisma.$disconnect(); return; }
  await prisma.$transaction(async (tx) => {
    for (const { mp, c, atual, variacao } of plano) {
      await tx.mpHistoricoPreco.create({ data: { mp_id: mp.id, preco_kg_brl: c.preco, preco_anterior_kg: atual ?? undefined, variacao_pct: variacao ?? undefined, fornecedor: c.fornecedor, data_cotacao: new Date(c.data), origem: 'atualizacao_rapida', fonte_info: 'ultima_compra', observacoes: c.obs, registrado_por: admin?.id ?? null } });
      await tx.materiaPrima.update({ where: { id: mp.id }, data: { preco_anterior: atual ?? undefined, preco_kg_brl: c.preco, aumento_pct: variacao ?? undefined, fornecedor: c.fornecedor, data_cotacao: new Date(c.data), flag_aumento_relevante: false } });
      await tx.auditLog.create({ data: { user_id: admin?.id ?? null, acao: 'atualizar_preco_mp', entidade: 'materia_prima', entidade_id: String(mp.codigo), detalhes: { de: atual, para: c.preco, variacao_pct: variacao, fornecedor: c.fornecedor, fonte: 'ultima_compra', motivo: c.obs } } });
    }
  });
  console.log('\nAPLICADO.');
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
