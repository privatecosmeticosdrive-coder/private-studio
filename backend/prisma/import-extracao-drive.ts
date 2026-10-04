/**
 * Importa as fórmulas extraídas das fotos do Drive ("ORÇAMENTOS — MAIO A AGOSTO 2026").
 * Fonte: prisma/extracao-drive/formulas_staging.json (gerado por tools/extracao-drive — ver docs/extracao-drive-2026-10).
 *
 * O QUE FAZ (e só isso):
 *   - cria fórmulas NOVAS como status='rascunho', origem='extracao_drive', composição casada por CÓDIGO de MP;
 *   - importa apenas status_extracao='confirmada' (todas as contas da folha fecharam + código↔nome bateu);
 *   - NÃO altera preço de MP, NÃO altera fórmula existente, NÃO toca orçamento (snapshot intacto).
 *
 * Pula (e reporta) a fórmula quando:
 *   - algum código de MP não existe no banco, ou o nome no banco não bate com o lido na folha;
 *   - alguma concentração tem mais de 3 casas (formula_composicao.concentracao_pct é Decimal(6,3): arredondaria calado);
 *   - já existe no banco fórmula com a MESMA composição (mesmo conjunto mp_id + %), de qualquer origem;
 *   - já foi importada antes (idempotente: sha256 da foto em observacoes de origem='extracao_drive').
 *
 * Uso:
 *   npm run import:extracao-drive              -> PREVIEW (somente leitura)
 *   npm run import:extracao-drive -- --apply   -> grava em UMA transação e escreve o rollback .sql (untracked)
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const STAGING = path.join(__dirname, 'extracao-drive', 'formulas_staging.json');
const ORIGEM = 'extracao_drive';

type Item = {
  ordem: number;
  mp_codigo: number | null;
  mp_nome_original: string | null;
  fase: string | null;
  concentracao_pct: string | null;
  preco_kg_snapshot: string | null;
  fornecedor_pref: string | null;
};
type Fonte = { drive_id: string; caminho: string; sha256: string; link: string };
type FormulaStaging = {
  n: number;
  status_extracao: string;
  nome_produto: string | null;
  cliente_original: string | null;
  data_folha: string | null;
  batelada: string | null;
  soma_pct: string | null;
  fontes: Fonte[];
  composicao: Item[];
};

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(['de', 'do', 'da', 'e', 'and', 'com', 'c']);

// mesma regra do validador da extração: um nome contido no outro (palavra a palavra) ou bigramas parecidos
function nomeBate(a: string | null, b: string | null): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  const ta = new Set(na.split(' ').filter((w) => !STOP.has(w)));
  const tb = new Set(nb.split(' ').filter((w) => !STOP.has(w)));
  const contido = (x: Set<string>, y: Set<string>) => [...x].every((w) => y.has(w));
  if (ta.size && tb.size && (contido(ta, tb) || contido(tb, ta))) return true;
  const bigr = (s: string) => {
    const r = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) r.set(s.slice(i, i + 2), (r.get(s.slice(i, i + 2)) ?? 0) + 1);
    return r;
  };
  const ba = bigr(na);
  const bb = bigr(nb);
  let inter = 0;
  for (const [k, v] of ba) inter += Math.min(v, bb.get(k) ?? 0);
  const dice = (2 * inter) / (na.length - 1 + nb.length - 1);
  return dice >= 0.75; // calibrado: erro de OCR do mesmo nome ≥0,786; MPs diferentes ≤0,679 (ex.: Acido Latico × Acido Citrico = 0,609)
}

// "17/06/26" -> 2026-06-17 (só se a data for válida; senão null — nunca inventa)
function parseDataFolha(s: string | null): Date | null {
  const m = (s ?? '').match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(ano, Number(m[2]) - 1, Number(m[1])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[1]) ? d : null;
}

function casas(s: string): number {
  const p = s.split('.')[1];
  return p ? p.replace(/0+$/, '').length : 0;
}

// assinatura de composição: "mp_id:pct" ordenado (pct normalizado em 3 casas)
function assinatura(itens: { mp_id: number | null; pct: string }[]): string {
  return itens
    .map((i) => `${i.mp_id ?? 'x'}:${new Prisma.Decimal(i.pct).toFixed(3)}`)
    .sort()
    .join('|');
}

type Plano = { f: FormulaStaging; itens: (Item & { mp_id: number })[]; motivo?: string };

async function main() {
  const staging = JSON.parse(fs.readFileSync(STAGING, 'utf8')) as { gerado_em: string; formulas: FormulaStaging[] };
  const confirmadas = staging.formulas.filter((f) => f.status_extracao === 'confirmada');

  // ---- leituras (somente leitura) ----
  const mps = await prisma.materiaPrima.findMany({ select: { id: true, codigo: true, nome: true } });
  const mpPorCodigo = new Map(mps.map((m) => [m.codigo, m]));
  const existentes = await prisma.formula.findMany({
    select: { id: true, origem: true, observacoes: true, composicao: { select: { mp_id: true, concentracao_pct: true } } },
  });
  const sigExistentes = new Map<string, number>();
  for (const e of existentes) {
    if (!e.composicao.length || e.composicao.some((c) => c.concentracao_pct == null)) continue;
    sigExistentes.set(
      assinatura(e.composicao.map((c) => ({ mp_id: c.mp_id, pct: c.concentracao_pct!.toString() }))),
      e.id,
    );
  }
  const jaImportadas = new Set(
    existentes
      .filter((e) => e.origem === ORIGEM && e.observacoes)
      .flatMap((e) => [...e.observacoes!.matchAll(/sha256 ([0-9a-f]{64})/g)].map((m) => m[1])),
  );
  const baseline = { formulas: await prisma.formula.count(), composicao: await prisma.formulaComposicao.count() };

  // ---- plano ----
  const planos: Plano[] = confirmadas.map((f) => {
    if (!f.nome_produto) return { f, itens: [], motivo: 'nome do produto não lido' };
    if (f.fontes.some((x) => jaImportadas.has(x.sha256))) return { f, itens: [], motivo: 'já importada antes (mesma foto)' };
    const itens: (Item & { mp_id: number })[] = [];
    for (const it of f.composicao) {
      if (it.mp_codigo == null || it.concentracao_pct == null)
        return { f, itens: [], motivo: `linha ${it.ordem} sem código ou %` };
      const mp = mpPorCodigo.get(it.mp_codigo);
      if (!mp) return { f, itens: [], motivo: `MP código ${it.mp_codigo} não existe no banco` };
      if (!nomeBate(it.mp_nome_original, mp.nome))
        return { f, itens: [], motivo: `MP ${it.mp_codigo}: nome no banco "${mp.nome}" ≠ lido "${it.mp_nome_original}"` };
      if (casas(it.concentracao_pct) > 3)
        return { f, itens: [], motivo: `MP ${it.mp_codigo}: concentração ${it.concentracao_pct}% tem >3 casas (Decimal(6,3) arredondaria)` };
      itens.push({ ...it, mp_id: mp.id });
    }
    const sig = assinatura(itens.map((i) => ({ mp_id: i.mp_id, pct: i.concentracao_pct! })));
    const dup = sigExistentes.get(sig);
    if (dup) return { f, itens: [], motivo: `composição idêntica à fórmula #${dup} já existente` };
    return { f, itens };
  });
  const aImportar = planos.filter((p) => !p.motivo);
  const pulados = planos.filter((p) => p.motivo);

  console.log('============ IMPORT EXTRAÇÃO DRIVE ============');
  console.log(`Modo: ${APPLY ? 'APLICAR (escreve no banco)' : 'PREVIEW (somente leitura)'}`);
  console.log(`Staging: ${staging.formulas.length} fórmulas (gerado ${staging.gerado_em}); confirmadas: ${confirmadas.length}`);
  console.log(`  -> a importar: ${aImportar.length}  (${aImportar.reduce((a, p) => a + p.itens.length, 0)} linhas de composição)`);
  console.log(`  -> puladas   : ${pulados.length}`);
  for (const p of pulados) console.log(`     #${p.f.n} ${p.f.nome_produto ?? '(sem nome)'} — ${p.motivo}`);
  console.log(`Baseline: formulas=${baseline.formulas} formula_composicao=${baseline.composicao}`);
  console.log('\n--- PREVIEW (primeiras 10) ---');
  for (const p of aImportar.slice(0, 10)) {
    console.log(`#${p.f.n} "${p.f.nome_produto}" | cliente="${p.f.cliente_original}" | batelada=${p.f.batelada} | ${p.itens.length} itens | soma ${p.f.soma_pct}%`);
  }

  if (!APPLY) {
    console.log('\n>>> PREVIEW apenas. Nada foi escrito no banco.');
    console.log('>>> Para aplicar: npm run import:extracao-drive -- --apply');
    return;
  }

  // ---- APLICAR (uma transação; tudo ou nada) ----
  const criados = await prisma.$transaction(
    async (tx) => {
      const ids: number[] = [];
      for (const p of aImportar) {
        const f = p.f;
        const fonte = f.fontes.map((x) => `${x.caminho} (${x.link}) sha256 ${x.sha256}`).join(' ; ');
        const nova = await tx.formula.create({
          data: {
            nome_produto: f.nome_produto!,
            cliente_original: f.cliente_original,
            data_criacao: parseDataFolha(f.data_folha),
            batelada: f.batelada,
            total_ingredientes: p.itens.length,
            versao_codigo: '1.0',
            origem: ORIGEM,
            status: 'rascunho',
            observacoes:
              `Extraída de foto do Drive (staging ${staging.gerado_em}; OCR + 5 conferências: Σ%, QTDE, CUSTO, código↔nome, plausibilidade). ` +
              `Preço da folha é snapshot do orçamento, sem data de cotação. Fonte: ${fonte}`,
            composicao: {
              create: p.itens.map((it, i) => {
                const conc = new Prisma.Decimal(it.concentracao_pct!);
                const preco = it.preco_kg_snapshot != null ? new Prisma.Decimal(it.preco_kg_snapshot) : null;
                return {
                  ordem: i,
                  fase: it.fase,
                  mp_id: it.mp_id,
                  mp_nome_original: it.mp_nome_original,
                  concentracao_pct: conc,
                  fornecedor_pref: it.fornecedor_pref,
                  preco_kg_snapshot: preco ? preco.toDecimalPlaces(2) : null,
                  custo_na_formula_snapshot: preco ? conc.div(100).mul(preco).toDecimalPlaces(4) : null,
                };
              }),
            },
          },
          select: { id: true },
        });
        ids.push(nova.id);
      }
      // custo_mp_kg com preços ATUAIS do banco — mesma regra de FormulasService.calcularCusto (Σ conc/100 × preco_kg_brl)
      for (const id of ids) {
        const comp = await tx.formulaComposicao.findMany({
          where: { formula_id: id },
          select: { concentracao_pct: true, mp: { select: { preco_kg_brl: true } } },
        });
        let total = 0;
        for (const c of comp) {
          if (c.mp?.preco_kg_brl != null && c.concentracao_pct != null)
            total += (Number(c.concentracao_pct) / 100) * Number(c.mp.preco_kg_brl);
        }
        await tx.formula.update({ where: { id }, data: { custo_mp_kg: Number(total.toFixed(4)) } });
      }
      return ids;
    },
    { timeout: 120_000 },
  );

  const depois = { formulas: await prisma.formula.count(), composicao: await prisma.formulaComposicao.count() };
  const linhas = aImportar.reduce((a, p) => a + p.itens.length, 0);
  console.log(`\nAplicado: ${criados.length} fórmulas, ${linhas} linhas de composição.`);
  console.log(`Depois: formulas=${depois.formulas} (Δ ${depois.formulas - baseline.formulas}) formula_composicao=${depois.composicao} (Δ ${depois.composicao - baseline.composicao})`);

  // rollback .sql (UNTRACKED de propósito — CLAUDE.md regra 3)
  if (!criados.length) return;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rb = path.join(__dirname, `rollback-extracao-drive-${ts}.sql`);
  const lista = criados.join(', ');
  fs.writeFileSync(
    rb,
    `-- Rollback do import-extracao-drive (${criados.length} fórmulas criadas em ${ts})\n` +
      `-- Baseline antes: formulas=${baseline.formulas} formula_composicao=${baseline.composicao}\n` +
      `BEGIN;\n` +
      `DELETE FROM formula_composicao WHERE formula_id IN (${lista});\n` +
      `DELETE FROM formulas WHERE id IN (${lista}) AND origem = '${ORIGEM}';\n` +
      `COMMIT;\n`,
  );
  console.log(`Rollback escrito em ${rb}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('\nFalhou ❌', e);
    await prisma.$disconnect();
    process.exit(1);
  });
