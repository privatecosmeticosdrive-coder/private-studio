/**
 * Importa as fórmulas e os preços de MP extraídos das fotos do Drive ("ORÇAMENTOS — MAIO A AGOSTO 2026").
 * Fonte: prisma/extracao-drive/formulas_staging.json (gerado por tools/extracao-drive — ver docs/extracao-drive-2026-10).
 *
 * FÓRMULAS — cria fórmulas NOVAS (status='rascunho', origem='extracao_drive'), composição casada por CÓDIGO de MP:
 *   - entram: 'confirmada'; 'origem_nao_fecha_100' (a folha imprime TOTAL ≠ 100% = margem para ajuste — decisão
 *     do Gabriel 04/10/2026, anotado em observacoes); e 'pendente_conferencia' cuja ÚNICA pendência é "código fora
 *     do kb de maio" (o próprio script confere o código e o nome no banco — se não existir/divergir, pula);
 *   - concentração com mais de 3 casas é ARREDONDADA a 3 (Decimal(6,3); decisão do Gabriel) e anotada em observacoes;
 *   - pula: código inexistente ou nome divergente no banco, composição idêntica a fórmula existente, foto já importada.
 *
 * PREÇOS — o R$/kg da folha vale como preço atualizado na DATA DA COTAÇÃO impressa na folha; sem data, maio/2026
 * (decisão do Gabriel). Só atualiza a MP se essa data for MAIS RECENTE que a data_cotacao já gravada. Grava como
 * FormulasService/MateriasPrimasService.atualizarPreco: histórico (mp_historico_precos, origem='extracao_drive'),
 * preco_anterior, aumento_pct, data_cotacao, flag_aumento_relevante. Não gera alerta in-app em lote (só a flag).
 * Fornecedor da MP só muda se o da folha for claramente outro (grafia diferente do mesmo não conta).
 *
 * NÃO altera fórmula existente nem orçamento (snapshot congelado intacto — regra 8).
 *
 * Uso:
 *   npm run import:extracao-drive                         -> PREVIEW (somente leitura)
 *   npm run import:extracao-drive -- --apply              -> grava (UMA transação) + rollback .sql (untracked)
 *   opções: --sem-precos | --sem-formulas
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const FORMULAS = !process.argv.includes('--sem-formulas');
const PRECOS = !process.argv.includes('--sem-precos');
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
  pendencias_cadastro: string[];
  nome_produto: string | null;
  nome_fonte?: string | null;
  nome_confirmado_ocr?: boolean | null;
  cliente_original: string | null;
  data_folha: string | null;
  batelada: string | null;
  soma_pct: string | null;
  fontes: Fonte[];
  composicao: Item[];
};
type PrecoStaging = {
  mp_codigo: number;
  preco_kg_brl: string;
  fornecedor_folha: string | null;
  data_cotacao: string; // ISO
  data_origem: 'folha' | 'referencia_maio';
  fonte: string;
  formula: number;
  produto: string | null;
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

function dice(a: string, b: string): number {
  const bigr = (s: string) => {
    const r = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) r.set(s.slice(i, i + 2), (r.get(s.slice(i, i + 2)) ?? 0) + 1);
    return r;
  };
  const ba = bigr(a);
  const bb = bigr(b);
  let inter = 0;
  for (const [k, v] of ba) inter += Math.min(v, bb.get(k) ?? 0);
  return (2 * inter) / Math.max(1, a.length - 1 + b.length - 1);
}

// mesma regra do validador da extração: um nome contido no outro (palavra a palavra) ou bigramas parecidos
function nomeBate(a: string | null, b: string | null): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  const ta = new Set(na.split(' ').filter((w) => !STOP.has(w)));
  const tb = new Set(nb.split(' ').filter((w) => !STOP.has(w)));
  const contido = (x: Set<string>, y: Set<string>) => [...x].every((w) => y.has(w));
  if (ta.size && tb.size && (contido(ta, tb) || contido(tb, ta))) return true;
  return dice(na, nb) >= 0.75; // calibrado: erro de OCR do mesmo nome ≥0,786; MPs diferentes ≤0,679 (ex.: Acido Latico × Acido Citrico = 0,609)
}

// fornecedor da folha × do banco: mesmo fornecedor com grafia diferente ("MundQuimica" × "Mundiquimica") conta como igual
function mesmoFornecedor(a: string | null, b: string | null): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return true; // sem informação não é "outro fornecedor"
  if (na.includes(nb) || nb.includes(na) || dice(na, nb) >= 0.75) return true;
  const ta = na.split(/[ /]/).filter((w) => w.length >= 4);
  const tb = nb.split(/[ /]/).filter((w) => w.length >= 4);
  return ta.some((x) => tb.some((y) => x === y || dice(x, y) >= 0.8));
}

// "17/06/26" -> 2026-06-17 (só se a data for válida; senão null — nunca inventa)
function parseDataFolha(s: string | null): Date | null {
  const m = (s ?? '').match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(ano, Number(m[2]) - 1, Number(m[1])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[1]) ? d : null;
}

// arredonda a 3 casas (Decimal(6,3)) — decisão do Gabriel 04/10/2026
function conc3(s: string): { valor: Prisma.Decimal; arredondado: boolean } {
  const d = new Prisma.Decimal(s);
  const r = d.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
  return { valor: r, arredondado: !r.equals(d) };
}

// assinatura de composição: "mp_id:pct(3 casas)" ordenado
function assinatura(itens: { mp_id: number | null; pct: Prisma.Decimal }[]): string {
  return itens
    .map((i) => `${i.mp_id ?? 'x'}:${i.pct.toFixed(3)}`)
    .sort()
    .join('|');
}

const SO_FORA_DO_KB = /: código não existe no cadastro \(kb-source\)$/;

// 'origem_nao_fecha_100' e 'pendente_conferencia' só entram se não houver pendência OU se a única pendência for
// "código fora do kb de maio" (o script confere no banco). Manuscrito, nome rasurado, código inferido, preço suspeito
// ou nome divergente BLOQUEIAM, qualquer que seja o status.
function elegivel(f: FormulaStaging): boolean {
  if (!['confirmada', 'origem_nao_fecha_100', 'pendente_conferencia'].includes(f.status_extracao)) return false;
  return f.pendencias_cadastro.every((p) => SO_FORA_DO_KB.test(p));
}

type ItemPlano = Item & { mp_id: number; conc: Prisma.Decimal; arredondado: boolean };
type Plano = { f: FormulaStaging; itens: ItemPlano[]; motivo?: string };
type PrecoPlano = {
  p: PrecoStaging;
  mp?: { id: number; codigo: number; nome: string; preco_kg_brl: Prisma.Decimal | null; preco_anterior: Prisma.Decimal | null; aumento_pct: Prisma.Decimal | null; fornecedor: string | null; data_cotacao: Date | null; flag_aumento_relevante: boolean };
  novo?: Prisma.Decimal;
  variacao?: number | null;
  trocaFornecedor?: boolean;
  motivo?: string;
};

async function main() {
  const staging = JSON.parse(fs.readFileSync(STAGING, 'utf8')) as {
    gerado_em: string;
    formulas: FormulaStaging[];
    precos_para_atualizar: PrecoStaging[];
    precos_ambiguos: { mp_codigo: number; data_cotacao: string; precos: string[] }[];
  };

  // ---- leituras (somente leitura) ----
  const mps = await prisma.materiaPrima.findMany({
    select: { id: true, codigo: true, nome: true, preco_kg_brl: true, preco_anterior: true, aumento_pct: true, fornecedor: true, data_cotacao: true, flag_aumento_relevante: true },
  });
  const mpPorCodigo = new Map(mps.map((m) => [m.codigo, m]));
  const existentes = await prisma.formula.findMany({
    select: { id: true, origem: true, observacoes: true, composicao: { select: { mp_id: true, concentracao_pct: true } } },
  });
  const sigExistentes = new Map<string, number>();
  for (const e of existentes) {
    if (!e.composicao.length || e.composicao.some((c) => c.concentracao_pct == null)) continue;
    sigExistentes.set(assinatura(e.composicao.map((c) => ({ mp_id: c.mp_id, pct: c.concentracao_pct! }))), e.id);
  }
  const jaImportadas = new Set(
    existentes
      .filter((e) => e.origem === ORIGEM && e.observacoes)
      .flatMap((e) => [...e.observacoes!.matchAll(/sha256 ([0-9a-f]{64})/g)].map((m) => m[1])),
  );
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 } });
  const threshold = cfg ? Number(cfg.alerta_aumento_mp_pct) : 20;
  const baseline = {
    formulas: await prisma.formula.count(),
    composicao: await prisma.formulaComposicao.count(),
    historico: await prisma.mpHistoricoPreco.count(),
  };

  // ---- plano de fórmulas ----
  const candidatas = FORMULAS ? staging.formulas.filter(elegivel) : [];
  const planos: Plano[] = candidatas.map((f) => {
    if (!f.nome_produto) return { f, itens: [], motivo: 'nome do produto não lido' };
    // o topo da folha tem logo, manuscritos e cliente: só vale nome lido no TÍTULO impresso (leitura visual dedicada)
    if (f.nome_fonte !== 'visual_titulo' || f.nome_confirmado_ocr !== true)
      return { f, itens: [], motivo: `nome do produto sem dupla leitura do título impresso (fonte: ${f.nome_fonte ?? 'desconhecida'}, confirmado: ${f.nome_confirmado_ocr ?? 'não'})` };
    if (f.fontes.some((x) => jaImportadas.has(x.sha256))) return { f, itens: [], motivo: 'já importada antes (mesma foto)' };
    const itens: ItemPlano[] = [];
    for (const it of f.composicao) {
      if (it.mp_codigo == null || it.concentracao_pct == null) return { f, itens: [], motivo: `linha ${it.ordem} sem código ou %` };
      const mp = mpPorCodigo.get(it.mp_codigo);
      if (!mp) return { f, itens: [], motivo: `MP código ${it.mp_codigo} não existe no banco` };
      if (!nomeBate(it.mp_nome_original, mp.nome))
        return { f, itens: [], motivo: `MP ${it.mp_codigo}: nome no banco "${mp.nome}" ≠ lido "${it.mp_nome_original}"` };
      const c = conc3(it.concentracao_pct);
      itens.push({ ...it, mp_id: mp.id, conc: c.valor, arredondado: c.arredondado });
    }
    const dup = sigExistentes.get(assinatura(itens.map((i) => ({ mp_id: i.mp_id, pct: i.conc }))));
    if (dup) return { f, itens: [], motivo: `composição idêntica à fórmula #${dup} já existente` };
    return { f, itens };
  });
  const aImportar = planos.filter((p) => !p.motivo);
  const pulados = planos.filter((p) => p.motivo);

  // ---- plano de preços ----
  const precos: PrecoPlano[] = (PRECOS ? staging.precos_para_atualizar : []).map((p) => {
    const mp = mpPorCodigo.get(p.mp_codigo);
    if (!mp) return { p, motivo: 'MP não existe no banco' };
    const novo = new Prisma.Decimal(p.preco_kg_brl).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const dataNova = new Date(`${p.data_cotacao}T00:00:00Z`);
    if (mp.data_cotacao && mp.data_cotacao.getTime() >= dataNova.getTime())
      return { p, mp, motivo: `banco já tem cotação de ${mp.data_cotacao.toISOString().slice(0, 10)} (≥ ${p.data_cotacao})` };
    const anterior = mp.preco_kg_brl != null ? Number(mp.preco_kg_brl) : null;
    const variacao = anterior != null && anterior > 0 ? Number((((Number(novo) - anterior) / anterior) * 100).toFixed(2)) : null;
    return { p, mp, novo, variacao, trocaFornecedor: !mesmoFornecedor(p.fornecedor_folha, mp.fornecedor) };
  });
  const aAtualizar = precos.filter((x) => !x.motivo);
  const precosPulados = precos.filter((x) => x.motivo);

  // ---- relatório ----
  console.log('============ IMPORT EXTRAÇÃO DRIVE ============');
  console.log(`Modo: ${APPLY ? 'APLICAR (escreve no banco)' : 'PREVIEW (somente leitura)'}   fórmulas=${FORMULAS ? 'sim' : 'não'} preços=${PRECOS ? 'sim' : 'não'}`);
  console.log(`Staging gerado ${staging.gerado_em}: ${staging.formulas.length} fórmulas, ${staging.precos_para_atualizar.length} preços candidatos, ${staging.precos_ambiguos.length} ambíguos`);
  console.log(`Baseline: formulas=${baseline.formulas} formula_composicao=${baseline.composicao} mp_historico_precos=${baseline.historico}`);
  if (FORMULAS) {
    const porStatus = (s: string) => aImportar.filter((p) => p.f.status_extracao === s).length;
    const arred = aImportar.reduce((a, p) => a + p.itens.filter((i) => i.arredondado).length, 0);
    console.log(`\nFÓRMULAS elegíveis: ${candidatas.length}`);
    console.log(`  -> a importar: ${aImportar.length} (confirmada ${porStatus('confirmada')}, origem≠100% ${porStatus('origem_nao_fecha_100')}, MP fora do kb conferida ${porStatus('pendente_conferencia')}) | ${aImportar.reduce((a, p) => a + p.itens.length, 0)} linhas | ${arred} concentrações arredondadas a 3 casas`);
    console.log(`  -> puladas   : ${pulados.length}`);
    for (const p of pulados) console.log(`     #${p.f.n} ${p.f.nome_produto ?? '(sem nome)'} — ${p.motivo}`);
  }
  if (PRECOS) {
    const sobe = aAtualizar.filter((x) => (x.variacao ?? 0) > 0).length;
    const desce = aAtualizar.filter((x) => (x.variacao ?? 0) < 0).length;
    const relev = aAtualizar.filter((x) => x.variacao != null && x.variacao >= threshold).length;
    console.log(`\nPREÇOS candidatos: ${precos.length}`);
    console.log(`  -> a atualizar: ${aAtualizar.length} (sobe ${sobe}, desce ${desce}, igual ${aAtualizar.length - sobe - desce}; ≥${threshold}%: ${relev}; data da folha ${aAtualizar.filter((x) => x.p.data_origem === 'folha').length}, referência maio ${aAtualizar.filter((x) => x.p.data_origem === 'referencia_maio').length}; troca de fornecedor ${aAtualizar.filter((x) => x.trocaFornecedor).length})`);
    const motivos = new Map<string, number>();
    for (const x of precosPulados) {
      const k = x.motivo!.startsWith('banco já tem') ? 'banco já tem cotação igual ou mais recente' : x.motivo!;
      motivos.set(k, (motivos.get(k) ?? 0) + 1);
    }
    console.log(`  -> não atualizados: ${precosPulados.length} — ${[...motivos].map(([k, v]) => `${k}: ${v}`).join('; ')}`);
    for (const a of staging.precos_ambiguos) console.log(`     ambíguo (não atualiza): MP ${a.mp_codigo} em ${a.data_cotacao}: R$ ${a.precos.join(' / ')}`);
    console.log('  maiores variações:');
    for (const x of [...aAtualizar].sort((a, b) => Math.abs(b.variacao ?? 0) - Math.abs(a.variacao ?? 0)).slice(0, 10))
      console.log(`     MP ${x.p.mp_codigo} ${x.mp!.nome}: R$ ${x.mp!.preco_kg_brl ?? '—'} (${x.mp!.data_cotacao?.toISOString().slice(0, 10) ?? 's/ data'}) -> R$ ${x.novo} (${x.p.data_cotacao}, ${x.p.data_origem}) ${x.variacao != null ? x.variacao + '%' : ''}`);
  }

  if (!APPLY) {
    console.log('\n>>> PREVIEW apenas. Nada foi escrito no banco.');
    console.log('>>> Para aplicar: npm run import:extracao-drive -- --apply');
    return;
  }

  // ---- APLICAR (uma transação; tudo ou nada) ----
  const res = await prisma.$transaction(
    async (tx) => {
      const formulaIds: number[] = [];
      for (const p of aImportar) {
        const f = p.f;
        const fonte = f.fontes.map((x) => `${x.caminho} (${x.link}) sha256 ${x.sha256}`).join(' ; ');
        const arred = p.itens.filter((i) => i.arredondado);
        const notas = [
          `Extraída de foto do Drive (staging ${staging.gerado_em}; OCR + 5 conferências: Σ%, QTDE, CUSTO, código↔nome, plausibilidade).`,
          f.status_extracao === 'origem_nao_fecha_100'
            ? `ATENÇÃO: a folha de origem imprime TOTAL = ${f.soma_pct}% (≠ 100%) — margem para ajuste; validar no laboratório.`
            : null,
          arred.length
            ? `Concentrações arredondadas a 3 casas: ${arred.map((i) => `${i.mp_codigo} ${i.concentracao_pct}→${i.conc.toFixed(3)}`).join(', ')}.`
            : null,
          'Preço da folha é snapshot do orçamento.',
          `Fonte: ${fonte}`,
        ].filter(Boolean);
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
            observacoes: notas.join(' '),
            composicao: {
              create: p.itens.map((it, i) => {
                const preco = it.preco_kg_snapshot != null ? new Prisma.Decimal(it.preco_kg_snapshot) : null;
                return {
                  ordem: i,
                  fase: it.fase,
                  mp_id: it.mp_id,
                  mp_nome_original: it.mp_nome_original,
                  concentracao_pct: it.conc,
                  fornecedor_pref: it.fornecedor_pref,
                  preco_kg_snapshot: preco ? preco.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : null,
                  custo_na_formula_snapshot: preco ? it.conc.div(100).mul(preco).toDecimalPlaces(4) : null,
                };
              }),
            },
          },
          select: { id: true },
        });
        formulaIds.push(nova.id);
      }

      // preços (como MateriasPrimasService.atualizarPreco, sem alerta em lote)
      const historicoIds: number[] = [];
      for (const x of aAtualizar) {
        const mp = x.mp!;
        const anterior = mp.preco_kg_brl != null ? Number(mp.preco_kg_brl) : null;
        const dataCotacao = new Date(`${x.p.data_cotacao}T00:00:00Z`);
        const fornecedor = x.trocaFornecedor ? x.p.fornecedor_folha! : mp.fornecedor;
        const h = await tx.mpHistoricoPreco.create({
          data: {
            mp_id: mp.id,
            preco_kg_brl: x.novo!,
            preco_anterior_kg: anterior ?? undefined,
            variacao_pct: x.variacao ?? undefined,
            fornecedor: x.p.fornecedor_folha || mp.fornecedor || 'Nao informado',
            data_cotacao: dataCotacao,
            origem: ORIGEM,
            fonte_info: 'outro',
            observacoes:
              `Preço de folha de orçamento (fórmula ${x.p.formula} "${x.p.produto ?? ''}"); data ${x.p.data_origem === 'folha' ? 'da cotação impressa na folha' : 'de referência maio/2026 (folha sem data)'}. ` +
              `Fonte: ${x.p.fonte}`,
          },
          select: { id: true },
        });
        historicoIds.push(h.id);
        await tx.materiaPrima.update({
          where: { id: mp.id },
          data: {
            preco_anterior: anterior ?? undefined,
            preco_kg_brl: x.novo!,
            aumento_pct: x.variacao ?? undefined,
            fornecedor,
            data_cotacao: dataCotacao,
            flag_aumento_relevante: x.variacao != null && x.variacao >= threshold,
          },
        });
      }

      // custo_mp_kg das fórmulas novas com os preços já atualizados — mesma regra de FormulasService.calcularCusto
      for (const id of formulaIds) {
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
      return { formulaIds, historicoIds };
    },
    { timeout: 300_000 },
  );

  const depois = {
    formulas: await prisma.formula.count(),
    composicao: await prisma.formulaComposicao.count(),
    historico: await prisma.mpHistoricoPreco.count(),
  };
  console.log(`\nAplicado: ${res.formulaIds.length} fórmulas, ${aImportar.reduce((a, p) => a + p.itens.length, 0)} linhas; ${res.historicoIds.length} preços de MP.`);
  console.log(`Depois: formulas=${depois.formulas} (Δ ${depois.formulas - baseline.formulas}) formula_composicao=${depois.composicao} (Δ ${depois.composicao - baseline.composicao}) mp_historico_precos=${depois.historico} (Δ ${depois.historico - baseline.historico})`);

  // rollback .sql (UNTRACKED de propósito — CLAUDE.md regra 3): apaga o criado e devolve cada MP ao estado anterior
  if (!res.formulaIds.length && !res.historicoIds.length) return;
  const lit = (v: unknown) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rb = path.join(__dirname, `rollback-extracao-drive-${ts}.sql`);
  const linhas = [
    `-- Rollback do import-extracao-drive (${ts}): ${res.formulaIds.length} fórmulas, ${res.historicoIds.length} preços`,
    `-- Baseline antes: formulas=${baseline.formulas} formula_composicao=${baseline.composicao} mp_historico_precos=${baseline.historico}`,
    'BEGIN;',
  ];
  if (res.formulaIds.length) {
    linhas.push(`DELETE FROM formula_composicao WHERE formula_id IN (${res.formulaIds.join(', ')});`);
    linhas.push(`DELETE FROM formulas WHERE id IN (${res.formulaIds.join(', ')}) AND origem = '${ORIGEM}';`);
  }
  if (res.historicoIds.length) linhas.push(`DELETE FROM mp_historico_precos WHERE id IN (${res.historicoIds.join(', ')}) AND origem = '${ORIGEM}';`);
  for (const x of aAtualizar) {
    const m = x.mp!;
    linhas.push(
      `UPDATE materias_primas SET preco_kg_brl = ${lit(m.preco_kg_brl)}, preco_anterior = ${lit(m.preco_anterior)}, aumento_pct = ${lit(m.aumento_pct)}, ` +
        `fornecedor = ${lit(m.fornecedor)}, data_cotacao = ${lit(m.data_cotacao?.toISOString().slice(0, 10))}, flag_aumento_relevante = ${m.flag_aumento_relevante} WHERE id = ${m.id};`,
    );
  }
  linhas.push('COMMIT;');
  fs.writeFileSync(rb, linhas.join('\n') + '\n');
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
