/* eslint-disable */
// ============================================================================
// BACKFILL EM LOTE — atribuição assistida de NCM (Fase 2). Mapa aprovado pelo
// Gabriel. Grava formulas.ncm_id + ncm_revisado=false SÓ onde ncm_id É NULL.
//
// Camadas (override vence o classificador):
//  1. OVERRIDE explícito por id (PET, reclassificados, DEO).
//  2. Classificador nominal da Fase 1 (mesmas regras G + C aprovadas).
//  3. Fallback por categoria (cabelos->3305.90.00, skincare->3304.99.90).
//  4. Sem match -> RESTO (não grava).
//
// USO:
//   node prisma/backfill-ncm-formulas-lote.cjs            -> DRY-RUN + baseline
//   node prisma/backfill-ncm-formulas-lote.cjs --commit   -> grava (transação)
// ============================================================================
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const COMMIT = process.argv.includes('--commit');
const p = new PrismaClient();

const norm = (s) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const CAPILAR = /capilar|cabelo|hair|matizador|cachos|liso|crespo/;

// ---- 1) OVERRIDE explícito por id -> "ncm|ex" (autoridade máxima) ----
const OVERRIDE = {};
const setOv = (ncmex, ...ids) => ids.forEach((id) => {
  if (OVERRIDE[id]) throw new Error(`COLISAO de override no id ${id}: ${OVERRIDE[id]} vs ${ncmex}`);
  OVERRIDE[id] = ncmex;
});
// PET (18)
setOv('3305.10.00|', 43, 385, 386, 387, 493, 460, 736);
setOv('3305.90.00|', 395, 739, 740);
setOv('3305.90.00|Ex01', 125);
setOv('3304.99.90|', 337, 390, 476);
setOv('3307.90.00|', 77);
setOv('3307.20.10|', 291, 473);
setOv('3402.31.00|', 436);
// RECLASSIFICADOS
setOv('3304.99.90|', 749, 469, 472, 296, 297, 580); // skincare
setOv('3307.20.10|', 175, 465, 474); // DEO

// ---- 2) classificador nominal (PIPE da Fase 1) -> grupo ----
const PIPE = [
  ['camufl', '3305.90.00|Ex01', (n) => /camufl|camoufl|kamufl/.test(n)],
  ['shampoo', '3305.10.00|', (n) => /shampoo|xampu/.test(n)],
  ['serum_cap', '3305.90.00|Ex01', (n) => /(serum|hidratante)/.test(n) && CAPILAR.test(n)],
  ['pomada', '3305.90.00|', (n) => /pomada/.test(n) && /modelador/.test(n)],
  ['facial', '3304.99.90|', (n) => /serum|facial|face|pele|anti ?idade|antissinais|clareador/.test(n)],
  ['hidratante', '3304.99.90|', (n) => /hidratante|creme corporal|locao corporal|corporal/.test(n)],
  ['condicionador', '3305.90.00|Ex01', (n) => /condicionador/.test(n)],
  ['masc_cap', '3305.90.00|', (n) => /mascara/.test(n) && CAPILAR.test(n)],
  ['leavein', '3305.90.00|', (n) => /leave ?-? ?in|finalizador|pentear|umidificador|reparador de pontas|protetor termico/.test(n)],
  ['out_cap', '3305.90.00|', (n) => CAPILAR.test(n) || /tonico capilar|queda/.test(n)],
  ['alisa', '3305.20.00|', (n) => /alisa|progressiva|relaxament|botox capilar|selagem/.test(n)],
  ['sabliq', null, (n) => /sabonete liquido|gel de limpeza|sabonete intimo|higienizador|cleanser/.test(n)], // fiscal: só via override
  ['sabonete', '3401.11.90|', (n) => /sabonete/.test(n)],
  ['perfume', null, (n) => /perfume|parfum|extrait/.test(n)], // grupo vazio (todos em override)
  ['colonia', '3303.00.20|', (n) => /colonia|body ?splash|agua de/.test(n)],
  ['deo', '3307.20.10|', (n) => /desodorante|deo ?(roll|spray|stick)/.test(n)],
  ['barba', '3307.10.00|', (n) => /barba|shave|barbear/.test(n)],
  ['unha', '3304.30.00|', (n) => /esmalte|cuticula|unha/.test(n)],
  ['labios', '3304.10.00|', (n) => /batom|labial|gloss|lip /.test(n)],
  ['olhos', '3304.20.10|', (n) => /rimel|mascara de cilios|delineador|sombra|lapis de olho/.test(n)],
  ['solar', '3304.99.90|Ex02', (n) => /protetor solar|fps|antissolar|sunscreen/.test(n)],
  ['bronze', '3304.99.90|Ex01', (n) => /bronzead/.test(n)],
  ['sais', '3307.30.00|', (n) => /sais de banho|espuma de banho|banho de imersao/.test(n)],
  ['ambiente', '3307.49.00|', (n) => /difusor|aromatizador|home spray|ambiente/.test(n)],
  ['talco', '3304.91.00|Ex01', (n) => /talco/.test(n)],
];
const classificar = (n) => (PIPE.find(([, , t]) => t(n)) ?? [null, null])[1];

// ---- 3) fallback por categoria ----
const FALLBACK_CAT = { cabelos: '3305.90.00|', skincare: '3304.99.90|' };

(async () => {
  const rows = await p.formula.findMany({
    where: { status: 'validada', ncm_id: null },
    select: { id: true, nome_produto: true, categoria: true }, orderBy: { id: 'asc' },
  });

  // monta mapa final id -> ncmex + fonte
  let plano = []; // {id, nome, ncmex, fonte}
  const resto = [];
  for (const f of rows) {
    const n = norm(f.nome_produto);
    let ncmex = null, fonte = null;
    if (OVERRIDE[f.id]) { ncmex = OVERRIDE[f.id]; fonte = 'override'; }
    else {
      const cls = classificar(n);
      if (cls) { ncmex = cls; fonte = 'classificador'; }
      else if (FALLBACK_CAT[f.categoria ?? '']) { ncmex = FALLBACK_CAT[f.categoria]; fonte = 'categoria'; }
    }
    if (ncmex) plano.push({ id: f.id, nome: f.nome_produto, ncmex, fonte });
    else resto.push(f);
  }

  // sanity: NCMs existem ativos? (inclui 3402.31.00 explicitamente)
  const usados = [...new Set([...plano.map((x) => x.ncmex), '3402.31.00|'])];
  const ncmId = {}; // ncmex -> id (ou null)
  console.log('=== SANITY: NCMs do mapa ===');
  let faltando = false;
  for (const ne of usados) {
    const [ncm, ex] = ne.split('|');
    const r = await p.ncm.findUnique({ where: { ncm_ex_tipi: { ncm, ex_tipi: ex } }, select: { id: true, ativo: true } });
    ncmId[ne] = r && r.ativo ? r.id : null;
    const st = !r ? 'NAO EXISTE' : !r.ativo ? 'INATIVO' : `ok (id ${r.id})`;
    if (!r || !r.ativo) faltando = true;
    console.log(`  ${ncm}${ex ? ' ' + ex : ''}: ${st}`);
  }

  // Decisão do Gabriel (c): entradas com NCM inválido saem do lote pro RESTO
  // manual (nao abortam o lote). Caso atual: #436 -> 3402.31.00 (cap.34, criar
  // em ato próprio depois). Registra e segue com os válidos.
  const bloqueados = plano.filter((x) => !ncmId[x.ncmex]);
  if (bloqueados.length) {
    console.log('\n=== EXCLUIDOS do lote (NCM invalido) -> resto manual ===');
    bloqueados.forEach((x) => console.log(`  #${x.id} ${x.nome} -> ${x.ncmex.replace('|', ' ').trim()} (inexistente)`));
    plano = plano.filter((x) => ncmId[x.ncmex]);
  }

  // distribuicao
  const dist = {};
  for (const x of plano) dist[x.ncmex] = (dist[x.ncmex] ?? 0) + 1;
  console.log(`\n=== DRY-RUN: ${plano.length} a gravar | RESTO (nao grava): ${resto.length} ===`);
  console.log('distribuicao por NCM:');
  for (const [ne, q] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    const [ncm, ex] = ne.split('|');
    console.log(`  ${ncm}${ex ? ' ' + ex : ''}: ${q}${ncmId[ne] ? '' : '   <-- SEM NCM VALIDO'}`);
  }
  const porFonte = plano.reduce((a, x) => ((a[x.fonte] = (a[x.fonte] ?? 0) + 1), a), {});
  console.log('por fonte:', JSON.stringify(porFonte));

  // baseline (rollback) — todas as alvo tem ncm_id null; reverte a null + revisado ao atual
  const baselineSql = [
    '-- ROLLBACK do backfill-ncm-formulas-lote (Fase 2, ' + new Date().toISOString().slice(0, 10) + ')',
    '-- Reverte ncm_id ao NULL e ncm_revisado ao estado anterior nas fórmulas tocadas.',
    ...plano.map((x) => `UPDATE "formulas" SET ncm_id = NULL, ncm_revisado = false WHERE id = ${x.id}; -- ${x.nome.replace(/\n/g, ' ')}`),
  ].join('\n') + '\n';
  const rbPath = path.join(__dirname, 'backfill-ncm-formulas-lote-rollback-' + new Date().toISOString().slice(0, 10) + '.sql');
  fs.writeFileSync(rbPath, baselineSql);
  console.log(`\nbaseline/rollback: ${rbPath} (${plano.length} linhas)`);

  void faltando; // NCM inválido não aborta mais (decisão c): vira resto manual, já filtrado acima.

  if (COMMIT) {
    await p.$transaction(
      plano.map((x) => p.formula.update({ where: { id: x.id }, data: { ncm_id: ncmId[x.ncmex], ncm_revisado: false } })),
    );
    console.log(`\nAPLICADO em transação: ${plano.length} fórmulas.`);
  } else {
    console.log('\nDRY-RUN — nada gravado. Rode com --commit após aprovação.');
  }
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
