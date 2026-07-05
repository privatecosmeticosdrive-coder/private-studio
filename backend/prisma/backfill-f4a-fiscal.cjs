/* eslint-disable */
// ============================================================================
// BACKFILL F4 FASE A — dados fiscais validados pelo contador (parecer 04/07/2026).
// Fonte: docs/fiscal/validacao-fiscal-private-studio-objetiva.md (§3 e §6).
//
// O QUE FAZ (tudo dirigido por dados deste arquivo, nada inferido):
//   1. Normaliza os 6 NCMs com EX embutido na string ("3304.91.00-Ex01") para
//      o par (ncm, ex_tipi) — D5.
//   2. Insere os 4 EX faltantes apontados no parecer: 3307.90.00 Ex01 (7,8%),
//      3401.19.00 Ex01/Ex02 (6,5%) e Ex03 (0%).
//   3. tratamento: 'aliquota_zero' onde IPI validado = 0%; 'nao_tributado' no
//      0000.00.00 (nao e classificacao de produto — uso restrito a linha de MO).
//   4. icms_nominal_pct = 25 no 3303.00.10 (A2; DANFE + analise hibrida §4).
//   5. provisorio = false + fundamento_legal nas linhas validadas (D5).
//   6. Seed do parametro_fiscal (D4): pis/cofins monofasico e comum, carga
//      art.34, icms nominal padrao — vigencia 2026-07-04.
//
// USO:
//   node prisma/backfill-f4a-fiscal.cjs            -> DRY-RUN (imprime plano)
//   node prisma/backfill-f4a-fiscal.cjs --commit   -> aplica + gera rollback .sql
// ============================================================================

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const COMMIT = process.argv.includes('--commit');
const FUND = 'Parecer contador 04/07/2026 (validacao objetiva) — TIPI/ADE 001/2026 + Lei 10.147/2000';
const VIGENCIA = new Date('2026-07-04T00:00:00Z');

// 1) normalizacao dos EX embutidos (string atual -> par ncm/ex_tipi)
const NORMALIZAR = [
  { de: '3304.91.00-Ex01', ncm: '3304.91.00', ex: 'Ex01' },
  { de: '3304.99.90-Ex01', ncm: '3304.99.90', ex: 'Ex01' },
  { de: '3304.99.90-Ex02', ncm: '3304.99.90', ex: 'Ex02' },
  { de: '3305.90.00-Ex01', ncm: '3305.90.00', ex: 'Ex01' },
  { de: '3401.11.90-Ex01', ncm: '3401.11.90', ex: 'Ex01' },
];

// 2) EX faltantes do parecer (§3, observacoes das linhas 3307.90.00 e 3401.19.00)
const INSERIR = [
  { ncm: '3307.90.00', ex: 'Ex01', ipi: 7.8, mono: true,  trat: 'tributado',     desc: 'Ex 01 da posicao 3307.90.00 (TIPI/ADE 001/2026)' },
  { ncm: '3401.19.00', ex: 'Ex01', ipi: 6.5, mono: false, trat: 'tributado',     desc: 'Ex 01 da posicao 3401.19.00 (TIPI/ADE 001/2026)' },
  { ncm: '3401.19.00', ex: 'Ex02', ipi: 6.5, mono: false, trat: 'tributado',     desc: 'Ex 02 da posicao 3401.19.00 (TIPI/ADE 001/2026)' },
  { ncm: '3401.19.00', ex: 'Ex03', ipi: 0,   mono: false, trat: 'aliquota_zero', desc: 'Ex 03 da posicao 3401.19.00 (TIPI/ADE 001/2026)' },
];

// 6) parametros fiscais versionados (parecer §2 e §5)
const PARAMETROS = [
  { chave: 'pis_monofasico_pct',      valor: 2.2,  fund: 'Lei 10.147/2000, art. 1o, I, a — fabricante/importador' },
  { chave: 'cofins_monofasico_pct',   valor: 10.3, fund: 'Lei 10.147/2000, art. 1o, I, a — fabricante/importador' },
  { chave: 'pis_comum_pct',           valor: 1.65, fund: 'Regime nao cumulativo — Lei 10.637/2002 (parecer §2)' },
  { chave: 'cofins_comum_pct',        valor: 7.6,  fund: 'Regime nao cumulativo — Lei 10.833/2003 (parecer §2)' },
  { chave: 'icms_carga_art34_pct',    valor: 12,   fund: 'Art. 34 do Anexo II do RICMS/SP — carga efetiva; vedado p/ Simples e consumidor final' },
  { chave: 'icms_nominal_padrao_pct', valor: 18,   fund: 'RICMS/SP — aliquota interna padrao (fallback quando NCM nao tem icms_nominal_pct)' },
];

async function main() {
  const p = new PrismaClient();
  const rollback = [];
  const plano = [];

  const todas = await p.ncm.findMany({ orderBy: { id: 'asc' } });
  const porNome = new Map(todas.map((r) => [r.ncm, r]));

  // -- 1. normalizar EX embutidos --
  for (const n of NORMALIZAR) {
    const row = porNome.get(n.de);
    if (!row) { console.log(`AVISO: "${n.de}" nao encontrada — pulando`); continue; }
    plano.push({ op: 'update', id: row.id, data: { ncm: n.ncm, ex_tipi: n.ex } });
    rollback.push(`UPDATE "ncm" SET ncm = '${n.de}', ex_tipi = '' WHERE id = ${row.id};`);
  }

  // -- 3/4/5. tratamento + icms_nominal + des-provisionar as linhas existentes --
  for (const row of todas) {
    const data = { provisorio: false, fundamento_legal: FUND, vigencia_inicio: VIGENCIA };
    if (row.ncm === '0000.00.00') {
      data.tratamento = 'nao_tributado';
      data.fundamento_legal = FUND + ' — nao e classificacao fiscal de produto; uso restrito a linha de mao de obra na NF-e';
    } else if (Number(row.ipi_pct) === 0) {
      data.tratamento = 'aliquota_zero';
    }
    if (row.ncm === '3303.00.10') data.icms_nominal_pct = 25; // A2 — analise hibrida §4.2
    plano.push({ op: 'update', id: row.id, data });
    rollback.push(
      `UPDATE "ncm" SET provisorio = true, fundamento_legal = NULL, vigencia_inicio = NULL, tratamento = 'tributado', icms_nominal_pct = NULL WHERE id = ${row.id};`,
    );
  }

  // -- 2. inserir EX faltantes --
  for (const n of INSERIR) {
    plano.push({
      op: 'insert',
      data: {
        ncm: n.ncm, ex_tipi: n.ex, descricao: n.desc, ipi_pct: n.ipi, monofasico: n.mono,
        tratamento: n.trat, provisorio: false, fundamento_legal: FUND, vigencia_inicio: VIGENCIA,
      },
    });
    rollback.push(`DELETE FROM "ncm" WHERE ncm = '${n.ncm}' AND ex_tipi = '${n.ex}';`);
  }

  // -- 6. parametros fiscais --
  for (const pf of PARAMETROS) {
    plano.push({ op: 'parametro', data: { chave: pf.chave, valor: pf.valor, vigencia_inicio: VIGENCIA, fundamento_legal: pf.fund } });
    rollback.push(`DELETE FROM "parametro_fiscal" WHERE chave = '${pf.chave}' AND vigencia_inicio = '2026-07-04';`);
  }

  console.log(`PLANO: ${plano.length} operacoes (${COMMIT ? 'COMMIT' : 'DRY-RUN'})`);
  for (const op of plano) console.log(' ', op.op, op.id ?? '', JSON.stringify(op.data));

  if (COMMIT) {
    await p.$transaction(async (tx) => {
      for (const op of plano) {
        if (op.op === 'update') await tx.ncm.update({ where: { id: op.id }, data: op.data });
        else if (op.op === 'insert') await tx.ncm.create({ data: op.data });
        else await tx.parametroFiscal.create({ data: op.data });
      }
    });
    const rb = path.join(__dirname, 'f4a-seed-rollback-2026-07-04.sql');
    fs.writeFileSync(rb, '-- ROLLBACK dos DADOS do backfill-f4a-fiscal (rodar ANTES do rollback de schema)\n' + rollback.join('\n') + '\n');
    console.log(`\nAPLICADO. Rollback: ${rb}`);
  } else {
    console.log('\nDRY-RUN — nada gravado. Rode com --commit para aplicar.');
  }
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
