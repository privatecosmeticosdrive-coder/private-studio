/**
 * Importacao do kb.json (banco de conhecimento v8) para o PostgreSQL.
 *
 *   materias_primas  (1.162)  + mp_fornecedores_alt
 *   formulas         (814)    + formula_composicao  (~12.038 linhas)
 *
 * - Match MP <-> composicao por NOME normalizado (sem acento, minusculo, espacos colapsados).
 * - Preserva codigo da MP e id original da formula (p/ citacoes #id no chat).
 * - Idempotente: limpa os dados de origem "banco_validado" antes de reimportar
 *   (ordem segura de FKs). NAO mexe em orcamentos/cotacoes/usuarios.
 *
 * Rodar:  npm run import:kb
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const KB_PATH = path.join(__dirname, 'kb-source.json');
const CHUNK = 1000; // limite seguro de params por INSERT no Postgres

// ---------- helpers ----------
function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '') // remove acentos (combining marks)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

async function createManyChunked<T>(
  label: string,
  rows: T[],
  fn: (batch: T[]) => Promise<any>,
) {
  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    await fn(batch);
    done += batch.length;
    process.stdout.write(`\r  ${label}: ${done}/${rows.length}`);
  }
  if (rows.length) process.stdout.write('\n');
}

// ---------- main ----------
async function main() {
  console.log('Lendo kb.json...');
  const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
  const mps: any[] = kb.materias_primas ?? [];
  const formulas: any[] = kb.formulas ?? [];
  console.log(`  ${mps.length} MPs · ${formulas.length} formulas`);

  // 1) LIMPEZA idempotente (ordem segura de FK) -------------------------
  console.log('\nLimpando dados de origem KB (reimport idempotente)...');
  await prisma.formulaComposicao.deleteMany({});
  await prisma.mpFornecedorAlt.deleteMany({});
  await prisma.formula.deleteMany({ where: { origem: 'banco_validado' } });
  await prisma.materiaPrima.deleteMany({});

  // 2) MATERIAS-PRIMAS ---------------------------------------------------
  // dedupe por codigo (ultimo vence) para evitar violar UNIQUE
  const mpByCodigo = new Map<number, any>();
  for (const mp of mps) {
    const codigo = num(mp.codigo);
    if (codigo === null) continue;
    mpByCodigo.set(codigo, mp);
  }
  const mpRows: Prisma.MateriaPrimaCreateManyInput[] = [];
  for (const [codigo, mp] of mpByCodigo) {
    mpRows.push({
      codigo,
      nome: mp.nome ?? `MP ${codigo}`,
      preco_kg_brl: num(mp.preco_kg_brl),
      preco_anterior: num(mp.preco_anterior_brl),
      aumento_pct: num(mp.aumento_pct),
      fornecedor: mp.fornecedor ?? null,
      embalagem_minima: mp.embalagem_minima ?? null,
      data_cotacao: parseDate(mp.data_cotacao),
      validade_cotacao: mp.validade_cotacao ?? null,
      n_formulas_uso: num(mp.n_formulas_uso) ?? 0,
    });
  }
  console.log('\nImportando materias-primas...');
  await createManyChunked('MPs', mpRows, (batch) =>
    prisma.materiaPrima.createMany({ data: batch, skipDuplicates: true }),
  );

  // mapa nome-normalizado -> mp_id  e  codigo -> mp_id
  const dbMps = await prisma.materiaPrima.findMany({
    select: { id: true, codigo: true, nome: true },
  });
  const idByNome = new Map<string, number>();
  const idByCodigo = new Map<number, number>();
  for (const m of dbMps) {
    idByCodigo.set(m.codigo, m.id);
    const key = norm(m.nome);
    if (key && !idByNome.has(key)) idByNome.set(key, m.id);
  }

  // 3) FORNECEDORES ALTERNATIVOS ----------------------------------------
  const altRows: Prisma.MpFornecedorAltCreateManyInput[] = [];
  for (const [codigo, mp] of mpByCodigo) {
    const mpId = idByCodigo.get(codigo);
    if (!mpId) continue;
    const alts: string[] = Array.isArray(mp.fornecedores_alternativos)
      ? mp.fornecedores_alternativos
      : [];
    const seen = new Set<string>();
    for (const f of alts) {
      const nome = (f ?? '').toString().trim();
      if (!nome || seen.has(norm(nome))) continue;
      seen.add(norm(nome));
      altRows.push({ mp_id: mpId, fornecedor: nome });
    }
  }
  console.log('Importando fornecedores alternativos...');
  await createManyChunked('Fornec.alt', altRows, (batch) =>
    prisma.mpFornecedorAlt.createMany({ data: batch, skipDuplicates: true }),
  );

  // 4) FORMULAS (preservando id original) -------------------------------
  const formulaRows: Prisma.FormulaCreateManyInput[] = [];
  for (const f of formulas) {
    const id = num(f.id);
    if (id === null) continue;
    formulaRows.push({
      id,
      nome_produto: f.nome_produto ?? `Formula ${id}`,
      versao_codigo: f.versao_codigo ?? null,
      cliente_original: f.cliente ?? null,
      data_criacao: parseDate(f.data_detectada),
      responsavel: f.responsavel ?? null,
      custo_mp_kg: num(f.custo_mp_total_brl_kg),
      origem: 'banco_validado',
      status: 'aprovada',
      batelada: f.batelada ?? null,
      total_ingredientes: num(f.total_ingredientes),
    });
  }
  console.log('Importando formulas...');
  await createManyChunked('Formulas', formulaRows, (batch) =>
    prisma.formula.createMany({ data: batch, skipDuplicates: true }),
  );
  // realinhar a sequence do id apos inserts com id explicito
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('formulas','id'), COALESCE((SELECT MAX(id) FROM formulas), 1))`,
  );

  // 5) COMPOSICAO (match MP por nome) -----------------------------------
  let total = 0;
  let matched = 0;
  const unmatchedNames = new Map<string, number>();
  const compRows: Prisma.FormulaComposicaoCreateManyInput[] = [];
  for (const f of formulas) {
    const formulaId = num(f.id);
    if (formulaId === null) continue;
    const comp: any[] = Array.isArray(f.composicao) ? f.composicao : [];
    comp.forEach((c, idx) => {
      total++;
      const nomeMp: string = c.materia_prima ?? '';
      const mpId = idByNome.get(norm(nomeMp)) ?? null;
      if (mpId) matched++;
      else if (nomeMp)
        unmatchedNames.set(nomeMp, (unmatchedNames.get(nomeMp) ?? 0) + 1);
      compRows.push({
        formula_id: formulaId,
        fase: c.fase ?? null,
        ordem: idx,
        mp_id: mpId,
        mp_nome_original: nomeMp || null,
        concentracao_pct: num(c.concentracao_pct),
        fornecedor_pref: c.fornecedor_snapshot ?? null,
        preco_kg_snapshot: num(c.preco_kg_brl_snapshot),
        custo_na_formula_snapshot: num(c.custo_na_formula_brl_kg),
      });
    });
  }
  console.log('Importando composicao...');
  await createManyChunked('Composicao', compRows, (batch) =>
    prisma.formulaComposicao.createMany({ data: batch, skipDuplicates: true }),
  );

  // 6) RELATORIO ---------------------------------------------------------
  const [cMp, cAlt, cFor, cComp] = await Promise.all([
    prisma.materiaPrima.count(),
    prisma.mpFornecedorAlt.count(),
    prisma.formula.count({ where: { origem: 'banco_validado' } }),
    prisma.formulaComposicao.count(),
  ]);
  const matchPct = total ? ((matched / total) * 100).toFixed(1) : '0';
  console.log('\n========== RELATORIO DE IMPORTACAO ==========');
  console.log(`Materias-primas : ${cMp}`);
  console.log(`Fornecedores alt: ${cAlt}`);
  console.log(`Formulas        : ${cFor}`);
  console.log(`Linhas composic.: ${cComp}`);
  console.log(
    `Match MP<->comp : ${matched}/${total} (${matchPct}%) — ${total - matched} sem match`,
  );
  const topUnmatched = [...unmatchedNames.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  if (topUnmatched.length) {
    console.log('\nTop 15 nomes de MP SEM match (nome -> ocorrencias):');
    for (const [nome, n] of topUnmatched) console.log(`  ${n}x  ${nome}`);
    console.log(
      '\n(linhas sem match guardam mp_nome_original; mp_id fica null — ajustavel depois)',
    );
  }
  console.log('=============================================');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('\nImportacao concluida ✅');
  })
  .catch(async (e) => {
    console.error('\nImportacao falhou ❌', e);
    await prisma.$disconnect();
    process.exit(1);
  });
