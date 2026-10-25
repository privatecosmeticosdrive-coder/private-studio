/**
 * Repasse de NCM — 2a rodada: regras decididas pelo DONO em 24/10/2026 para os grupos
 * INDEFINIDO do repasse-ncm.cjs (lidos de prisma/repasse-ncm-decisoes.json).
 *   node prisma/repasse-ncm-regras-dono.cjs            # plano (so le)
 *   node prisma/repasse-ncm-regras-dono.cjs --commit   # grava (transacao + audit_log)
 *
 * Regras do dono:
 *  - Capilar sem enxague (leave-on) = condicionador: 3305.90.00 Ex 01 (IPI 4,55%).
 *    (o dono escreveu "3305.99.90.01"; na TIPI e na tabela do Studio o condicionador e
 *    3305.90.00 com a Ex 01 — e esse o NCM aplicado.)
 *  - Pet: shampoo e banho a seco = 3305.10.00; limpa patas e multiuso = tensoativo,
 *    sabonete liquido 3401.30.00; hidratantes e cremes = 3305.90.00 Ex 01; repelente =
 *    3304.99.90 (outras preparacoes para a pele). Condicionador pet segue condicionador
 *    (Ex 01); colonia/perfume/fragrancia pet seguem "perfume = DEO".
 *  - Perfume = sempre DEO: liquido/spray 3307.20.10 (4,55%); perfume em creme 3307.20.90 (4,55%).
 *  - Limpeza facial = tensoativo, aliquota menor: 3401.30.00 (6,5%).
 *  - Demais grupos: ficam na fila e saem listados para decisao.
 * So grava formula que continua pendente (ncm_revisado=false, nao arquivada).
 */
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');

const COND = ['3305.90.00', 'Ex01'];
const XAMPU = ['3305.10.00', ''];
const SAB_LIQ = ['3401.30.00', ''];
const PELE = ['3304.99.90', ''];
const DEO_LIQ = ['3307.20.10', ''];
const DEO_OUTROS = ['3307.20.90', ''];

const norm = (s) => ` ${String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;

/** Decide o NCM pela regra do dono; null = continua indefinido (vai para a lista de decisao). */
function decidir(d) {
  const n = norm(d.nome);
  switch (d.regra) {
    case 'indef-leave-on':
      return { para: COND, regra: 'dono: capilar sem enxague = condicionador (Ex 01)' };
    case 'indef-limpeza-facial':
      return { para: SAB_LIQ, regra: 'dono: limpeza facial = tensoativo (3401.30.00)' };
    case 'indef-perfume':
    case 'indef-perfume-nome':
      return { para: DEO_LIQ, regra: 'dono: perfume sempre como DEO (3307.20.10)' };
    case 'indef-perfume-creme':
      return { para: DEO_OUTROS, regra: 'dono: perfume sempre como DEO; em creme = 3307.20.90' };
    case 'indef-pet':
      if (/ (shampoo|shp|xampu|banho a seco) /.test(n)) return { para: XAMPU, regra: 'dono: pet shampoo/banho a seco = 3305.10.00' };
      if (/ (limpa patas?|lava patas?|limpezas? das patas|limpa pata|multiuso) /.test(n)) return { para: SAB_LIQ, regra: 'dono: pet limpa patas/multiuso = tensoativo (3401.30.00)' };
      if (/ repelente /.test(n)) return { para: PELE, regra: 'dono: repelente = outras preparacoes para a pele (3304.99.90)' };
      if (/ (colonia|perfume|fragrancia) /.test(n)) return { para: DEO_LIQ, regra: 'dono: perfume sempre como DEO (3307.20.10)' };
      if (/ (condicionador|condicionadpr) /.test(n)) return { para: COND, regra: 'dono: condicionador pet = condicionador (Ex 01)' };
      if (/ (hidratante|hidrante|hidrat|creme|locao|leave in|pelagem) /.test(n)) return { para: COND, regra: 'dono: pet hidratante/creme = 3305.90.00 Ex 01' };
      return null;
    default:
      return null;
  }
}

(async () => {
  const arq = path.join(__dirname, 'repasse-ncm-decisoes.json');
  const base = JSON.parse(fs.readFileSync(arq, 'utf8')).decisoes.filter((d) => d.classe === 'INDEFINIDO');
  const [ncms, formulas] = await Promise.all([
    prisma.ncm.findMany({ where: { ativo: true }, select: { id: true, ncm: true, ex_tipi: true, descricao: true, ipi_pct: true } }),
    prisma.formula.findMany({
      where: { id: { in: base.map((d) => d.id) } },
      select: { id: true, nome_produto: true, ncm_id: true, ncm_revisado: true, status: true },
    }),
  ]);
  const rotulo = (r) => (r ? `${r.ncm}${r.ex_tipi ? ' ' + r.ex_tipi : ''} ${r.descricao} (IPI ${Number(r.ipi_pct).toLocaleString('pt-BR')}%)` : 'sem NCM');
  const acharNcm = ([ncm, ex]) => ncms.find((r) => r.ncm === ncm && (r.ex_tipi ?? '') === ex);
  for (const p of [COND, XAMPU, SAB_LIQ, PELE, DEO_LIQ, DEO_OUTROS]) {
    if (!acharNcm(p)) throw new Error(`NCM ${p.join(' ')} nao existe (ativo) na tabela do Studio — abortado.`);
  }

  const gravar = [];
  const ficam = [];
  for (const d of base) {
    const f = formulas.find((x) => x.id === d.id);
    if (!f || f.status === 'arquivada' || f.ncm_revisado) continue; // ja resolvida/arquivada depois
    const dec = decidir(d);
    if (!dec) {
      ficam.push(d);
      continue;
    }
    const para = acharNcm(dec.para);
    const de = ncms.find((r) => r.id === f.ncm_id) ?? null;
    gravar.push({ id: f.id, nome: f.nome_produto, de: rotulo(de), de_id: f.ncm_id, para: rotulo(para), para_id: para.id, regra: dec.regra });
  }

  const porDestino = {};
  for (const g of gravar) (porDestino[`${g.para}  <- ${g.regra}`] ??= []).push(g.nome);
  console.log(`Pendentes avaliadas: ${gravar.length + ficam.length} | aplicar regra do dono: ${gravar.length} | para decisao: ${ficam.length}\n`);
  for (const [k, nomes] of Object.entries(porDestino)) console.log(`${String(nomes.length).padStart(4)}  ${k}\n        ${nomes.join(' | ')}`);
  const porGrupo = {};
  for (const d of ficam) (porGrupo[d.duvida] ??= []).push(d.nome);
  console.log('\nPARA DECISAO (continuam na fila):');
  for (const [duvida, nomes] of Object.entries(porGrupo)) console.log(`${String(nomes.length).padStart(4)}  ${duvida}\n        ${nomes.join(' | ')}`);

  const saida = path.join(__dirname, 'repasse-ncm-regras-dono-decisoes.json');
  fs.writeFileSync(saida, JSON.stringify({ gerado_em: new Date().toISOString(), modo: COMMIT ? 'commit' : 'plano', aplicar: gravar, para_decisao: ficam }, null, 1));
  if (!COMMIT) {
    console.log(`\nPLANO — nada gravado. Detalhe em ${saida}. Use --commit.`);
    await prisma.$disconnect();
    return;
  }

  const admin = await prisma.user.findFirst({ where: { email: 'privatecosmeticosdrive@gmail.com', ativo: true }, select: { id: true } })
    ?? await prisma.user.findFirst({ where: { role: 'admin', ativo: true }, select: { id: true } });
  const agora = new Date();
  const n = await prisma.$transaction(async (tx) => {
    let total = 0;
    const porNcm = new Map();
    for (const g of gravar) porNcm.set(g.para_id, [...(porNcm.get(g.para_id) ?? []), g.id]);
    for (const [paraId, ids] of porNcm) {
      const r = await tx.formula.updateMany({
        where: { id: { in: ids }, status: { not: 'arquivada' }, ncm_revisado: false },
        data: { ncm_id: paraId, ncm_revisado: true, ncm_revisado_em: agora, ncm_revisado_por: admin.id },
      });
      total += r.count;
    }
    await tx.auditLog.createMany({
      data: gravar.map((g) => ({
        user_id: admin.id, acao: 'repasse_ncm', entidade: 'formula', entidade_id: String(g.id),
        detalhes: { classe: 'REGRA_DONO', de: g.de, para: g.para, regra: g.regra },
      })),
    });
    return total;
  }, { timeout: 120000 });
  console.log(`\nAPLICADO: ${n} formulas com NCM revisado pela regra do dono. Detalhe em ${saida}.`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
