/**
 * Importa MPs, fórmulas e preços extraídos das fotos do Drive ("ORÇAMENTOS — MAIO A AGOSTO 2026").
 * Fonte: prisma/extracao-drive/formulas_staging.json (gerado por tools/extracao-drive — ver docs/extracao-drive-2026-10).
 * Decisões do Gabriel (04/10/2026) aplicadas: arredondar % a 3 casas; subir fórmulas com TOTAL ≠ 100% (margem para
 * ajuste); preço vale na data do orçamento (folha → pasta, 2026 → maio); criar a MP que não existe; alertar
 * aumento e variação.
 *
 * Ordem (UMA transação, tudo ou nada):
 *   1. MPs NOVAS — códigos da extração que NÃO existem no banco são cadastrados (nome = leitura mais confirmada,
 *      fornecedor, embalagem mínima, preço/data da folha quando houver) + histórico de preço. Código que já existe
 *      no banco NUNCA é recadastrado.
 *   2. FÓRMULAS NOVAS — status='rascunho', origem='extracao_drive', composição por CÓDIGO de MP. Entram
 *      'confirmada', 'origem_nao_fecha_100' e 'pendente_conferencia' se não houver pendência ou se a única for
 *      "MP fora do kb de maio" (agora existe no banco ou é cadastrada no passo 1). Manuscrito, nome rasurado,
 *      código inferido, preço suspeito ou nome divergente BLOQUEIAM. Nome do produto só com dupla leitura do título.
 *   3. PREÇOS — atualiza a MP se a data do orçamento for MAIS RECENTE que a data_cotacao gravada; histórico,
 *      preco_anterior, aumento_pct, flag_aumento_relevante (como MateriasPrimasService.atualizarPreco).
 *   4. ALERTAS — alta ≥ limite (system_config.alerta_aumento_mp_pct): 'aumento_mp' (mesmo texto/severidade do
 *      AlertasService); queda ≥ limite: 'variacao_mp'; 1 alerta-resumo das MPs cadastradas. Respeita alertas_ativos.
 *
 * NÃO altera fórmula existente nem orçamento (snapshot congelado intacto — regra 8).
 *
 * Uso:
 *   npm run import:extracao-drive                         -> PREVIEW (somente leitura)
 *   npm run import:extracao-drive -- --apply              -> grava + rollback .sql (untracked)
 *   opções: --sem-precos | --sem-formulas | --sem-mps-novas | --sem-alertas
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const FORMULAS = !process.argv.includes('--sem-formulas');
const PRECOS = !process.argv.includes('--sem-precos');
const MPS_NOVAS = !process.argv.includes('--sem-mps-novas');
const ALERTAS = !process.argv.includes('--sem-alertas');
const STAGING = path.join(__dirname, 'extracao-drive', 'formulas_staging.json');
const ORIGEM = 'extracao_drive';
const PARA_ALERTA = ['comercial', 'pd', 'admin'];

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
  data_orcamento?: string | null; // ISO (folha → pasta 2026 → maio)
  data_orcamento_origem?: string | null;
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
  data_origem: 'folha' | 'pasta' | 'referencia_maio';
  fonte: string;
  formula: number;
  produto: string | null;
};
type MpNovaStaging = {
  mp_codigo: number;
  nome: string;
  fornecedor: string | null;
  embalagem_minima: string | null;
  preco_kg_brl: string | null;
  data_cotacao: string | null;
  data_origem: string | null;
  preco_ambiguo: boolean;
  n_fotos: number;
  leitura_visual: boolean;
  formulas: number[];
  fonte: string[];
};
type MpBanco = {
  id: number;
  codigo: number;
  nome: string;
  preco_kg_brl: Prisma.Decimal | null;
  preco_anterior: Prisma.Decimal | null;
  aumento_pct: Prisma.Decimal | null;
  fornecedor: string | null;
  data_cotacao: Date | null;
  flag_aumento_relevante: boolean;
  n_formulas_uso: number;
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

function isoParaData(iso: string | null | undefined): Date | null {
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : null;
}

const ORIGEM_DATA: Record<string, string> = {
  folha: 'data da cotação impressa na folha',
  pasta: 'data do orçamento no nome da pasta (2026)',
  referencia_maio: 'referência maio/2026 (sem data na folha nem na pasta)',
};

// arredonda a 3 casas (Decimal(6,3)) — decisão do Gabriel 04/10/2026
function conc3(s: string): { valor: Prisma.Decimal; arredondado: boolean } {
  const d = new Prisma.Decimal(s);
  const r = d.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
  return { valor: r, arredondado: !r.equals(d) };
}

// assinatura de composição: "codigo:pct(3 casas)" ordenado (por código: vale também p/ MP ainda a cadastrar)
function assinatura(itens: { codigo: number | null; pct: Prisma.Decimal }[]): string {
  return itens
    .map((i) => `${i.codigo ?? 'x'}:${i.pct.toFixed(3)}`)
    .sort()
    .join('|');
}

const SO_FORA_DO_KB = /: código não existe no cadastro \(kb-source\)$/;

// qualquer pendência além de "MP fora do kb de maio" bloqueia, qualquer que seja o status
function elegivel(f: FormulaStaging): boolean {
  if (!['confirmada', 'origem_nao_fecha_100', 'pendente_conferencia'].includes(f.status_extracao)) return false;
  return f.pendencias_cadastro.every((p) => SO_FORA_DO_KB.test(p));
}

type ItemPlano = Item & { mp_codigo: number; conc: Prisma.Decimal; arredondado: boolean };
type Plano = { f: FormulaStaging; itens: ItemPlano[]; motivo?: string };
type PrecoPlano = { p: PrecoStaging; mp?: MpBanco; novo?: Prisma.Decimal; variacao?: number | null; trocaFornecedor?: boolean; motivo?: string };

async function main() {
  const staging = JSON.parse(fs.readFileSync(STAGING, 'utf8')) as {
    gerado_em: string;
    formulas: FormulaStaging[];
    precos_para_atualizar: PrecoStaging[];
    precos_ambiguos: { mp_codigo: number; data_cotacao: string; precos: string[] }[];
    mps_a_cadastrar: MpNovaStaging[];
  };

  // ---- leituras (somente leitura) ----
  const mps: MpBanco[] = await prisma.materiaPrima.findMany({
    select: { id: true, codigo: true, nome: true, preco_kg_brl: true, preco_anterior: true, aumento_pct: true, fornecedor: true, data_cotacao: true, flag_aumento_relevante: true, n_formulas_uso: true },
  });
  const mpPorCodigo = new Map(mps.map((m) => [m.codigo, m]));
  const existentes = await prisma.formula.findMany({
    select: { id: true, origem: true, observacoes: true, composicao: { select: { concentracao_pct: true, mp: { select: { codigo: true } } } } },
  });
  const sigExistentes = new Map<string, number>();
  for (const e of existentes) {
    if (!e.composicao.length || e.composicao.some((c) => c.concentracao_pct == null)) continue;
    sigExistentes.set(assinatura(e.composicao.map((c) => ({ codigo: c.mp?.codigo ?? null, pct: c.concentracao_pct! }))), e.id);
  }
  const jaImportadas = new Set(
    existentes
      .filter((e) => e.origem === ORIGEM && e.observacoes)
      .flatMap((e) => [...e.observacoes!.matchAll(/sha256 ([0-9a-f]{64})/g)].map((m) => m[1])),
  );
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 } });
  const threshold = cfg ? Number(cfg.alerta_aumento_mp_pct) : 20;
  const alertasAtivos = ALERTAS && (cfg ? cfg.alertas_ativos : true);
  const conta = async () => ({
    mps: await prisma.materiaPrima.count(),
    formulas: await prisma.formula.count(),
    composicao: await prisma.formulaComposicao.count(),
    historico: await prisma.mpHistoricoPreco.count(),
    alertas: await prisma.alerta.count(),
  });
  const baseline = await conta();

  // ---- 1. MPs novas: só código que NÃO existe no banco ----
  const novas = (MPS_NOVAS ? staging.mps_a_cadastrar : []).filter((m) => !mpPorCodigo.has(m.mp_codigo));
  const jaExistiam = (MPS_NOVAS ? staging.mps_a_cadastrar : []).filter((m) => mpPorCodigo.has(m.mp_codigo));
  const nomeMp = new Map<number, string>([...mps.map((m) => [m.codigo, m.nome] as [number, string]), ...novas.map((m) => [m.mp_codigo, m.nome] as [number, string])]);

  // ---- 2. plano de fórmulas ----
  const candidatas = FORMULAS ? staging.formulas.filter(elegivel) : [];
  const planos: Plano[] = candidatas.map((f) => {
    if (!f.nome_produto) return { f, itens: [], motivo: 'nome do produto não lido' };
    if (f.nome_fonte !== 'visual_titulo' || f.nome_confirmado_ocr !== true)
      return { f, itens: [], motivo: `nome do produto sem dupla leitura do título impresso (fonte: ${f.nome_fonte ?? 'desconhecida'}, confirmado: ${f.nome_confirmado_ocr ?? 'não'})` };
    if (f.fontes.some((x) => jaImportadas.has(x.sha256))) return { f, itens: [], motivo: 'já importada antes (mesma foto)' };
    const itens: ItemPlano[] = [];
    for (const it of f.composicao) {
      if (it.mp_codigo == null || it.concentracao_pct == null) return { f, itens: [], motivo: `linha ${it.ordem} sem código ou %` };
      const nome = nomeMp.get(it.mp_codigo);
      if (!nome) return { f, itens: [], motivo: `MP código ${it.mp_codigo} não existe no banco e não está na lista de cadastro` };
      if (!nomeBate(it.mp_nome_original, nome))
        return { f, itens: [], motivo: `MP ${it.mp_codigo}: nome "${nome}" ≠ lido "${it.mp_nome_original}"` };
      const c = conc3(it.concentracao_pct);
      itens.push({ ...it, mp_codigo: it.mp_codigo, conc: c.valor, arredondado: c.arredondado });
    }
    const dup = sigExistentes.get(assinatura(itens.map((i) => ({ codigo: i.mp_codigo, pct: i.conc }))));
    if (dup) return { f, itens: [], motivo: `composição idêntica à fórmula #${dup} já existente` };
    return { f, itens };
  });
  const aImportar = planos.filter((p) => !p.motivo);
  const pulados = planos.filter((p) => p.motivo);

  // ---- 3. plano de preços (MP cadastrada agora já nasce com o preço: não entra aqui) ----
  const codNovas = new Set(novas.map((m) => m.mp_codigo));
  const precos: PrecoPlano[] = (PRECOS ? staging.precos_para_atualizar : [])
    .filter((p) => !codNovas.has(p.mp_codigo))
    .map((p) => {
      const mp = mpPorCodigo.get(p.mp_codigo);
      if (!mp) return { p, motivo: MPS_NOVAS ? 'MP não existe e não foi cadastrada' : 'MP não existe no banco (--sem-mps-novas)' };
      const novo = new Prisma.Decimal(p.preco_kg_brl).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const dataNova = isoParaData(p.data_cotacao)!;
      if (mp.data_cotacao && mp.data_cotacao.getTime() >= dataNova.getTime())
        return { p, mp, motivo: `banco já tem cotação de ${mp.data_cotacao.toISOString().slice(0, 10)} (≥ ${p.data_cotacao})` };
      const anterior = mp.preco_kg_brl != null ? Number(mp.preco_kg_brl) : null;
      const variacao = anterior != null && anterior > 0 ? Number((((Number(novo) - anterior) / anterior) * 100).toFixed(2)) : null;
      return { p, mp, novo, variacao, trocaFornecedor: !mesmoFornecedor(p.fornecedor_folha, mp.fornecedor) };
    });
  const aAtualizar = precos.filter((x) => !x.motivo);
  const precosPulados = precos.filter((x) => x.motivo);
  const altas = aAtualizar.filter((x) => x.variacao != null && x.variacao >= threshold);
  const quedas = aAtualizar.filter((x) => x.variacao != null && x.variacao <= -threshold);

  // ---- relatório ----
  console.log('============ IMPORT EXTRAÇÃO DRIVE ============');
  console.log(`Modo: ${APPLY ? 'APLICAR (escreve no banco)' : 'PREVIEW (somente leitura)'}   mps-novas=${MPS_NOVAS ? 'sim' : 'não'} fórmulas=${FORMULAS ? 'sim' : 'não'} preços=${PRECOS ? 'sim' : 'não'} alertas=${alertasAtivos ? 'sim' : 'não'}`);
  console.log(`Staging gerado ${staging.gerado_em}: ${staging.formulas.length} fórmulas, ${staging.mps_a_cadastrar.length} MPs fora do kb de maio, ${staging.precos_para_atualizar.length} preços candidatos, ${staging.precos_ambiguos.length} ambíguos`);
  console.log(`Baseline: materias_primas=${baseline.mps} formulas=${baseline.formulas} formula_composicao=${baseline.composicao} mp_historico_precos=${baseline.historico} alertas=${baseline.alertas}`);
  if (MPS_NOVAS) {
    console.log(`\nMPs NOVAS: ${novas.length} a cadastrar (${novas.filter((m) => m.preco_kg_brl).length} com preço, ${novas.filter((m) => !m.preco_kg_brl).length} sem preço); ${jaExistiam.length} já existem no banco (seguem como atualização de preço)`);
    for (const m of novas.slice(0, 15)) console.log(`     ${m.mp_codigo} "${m.nome}" | ${m.fornecedor ?? 's/ fornecedor'} | ${m.preco_kg_brl ? `R$ ${m.preco_kg_brl} (${m.data_cotacao})` : 'sem preço'}`);
    if (novas.length > 15) console.log(`     ... e mais ${novas.length - 15}`);
  }
  if (FORMULAS) {
    const porStatus = (s: string) => aImportar.filter((p) => p.f.status_extracao === s).length;
    const arred = aImportar.reduce((a, p) => a + p.itens.filter((i) => i.arredondado).length, 0);
    console.log(`\nFÓRMULAS elegíveis: ${candidatas.length}`);
    console.log(`  -> a importar: ${aImportar.length} (confirmada ${porStatus('confirmada')}, origem≠100% ${porStatus('origem_nao_fecha_100')}, com MP fora do kb ${porStatus('pendente_conferencia')}) | ${aImportar.reduce((a, p) => a + p.itens.length, 0)} linhas | ${arred} concentrações arredondadas a 3 casas`);
    console.log(`  -> puladas   : ${pulados.length}`);
    for (const p of pulados) console.log(`     #${p.f.n} ${p.f.nome_produto ?? '(sem nome)'} — ${p.motivo}`);
  }
  if (PRECOS) {
    const sobe = aAtualizar.filter((x) => (x.variacao ?? 0) > 0).length;
    const desce = aAtualizar.filter((x) => (x.variacao ?? 0) < 0).length;
    const por = (o: string) => aAtualizar.filter((x) => x.p.data_origem === o).length;
    console.log(`\nPREÇOS de MPs existentes: ${precos.length}`);
    console.log(`  -> a atualizar: ${aAtualizar.length} (sobe ${sobe}, desce ${desce}, igual ${aAtualizar.length - sobe - desce}; data: folha ${por('folha')}, pasta ${por('pasta')}, maio ${por('referencia_maio')}; troca de fornecedor ${aAtualizar.filter((x) => x.trocaFornecedor).length})`);
    console.log(`  -> alertas: ${altas.length} de alta ≥${threshold}% ('aumento_mp'), ${quedas.length} de queda ≥${threshold}% ('variacao_mp')${novas.length ? ', 1 resumo de MPs cadastradas' : ''}${alertasAtivos ? '' : ' — DESLIGADOS'}`);
    const motivos = new Map<string, number>();
    for (const x of precosPulados) {
      const k = x.motivo!.startsWith('banco já tem') ? 'banco já tem cotação igual ou mais recente' : x.motivo!;
      motivos.set(k, (motivos.get(k) ?? 0) + 1);
    }
    console.log(`  -> não atualizados: ${precosPulados.length}${motivos.size ? ' — ' + [...motivos].map(([k, v]) => `${k}: ${v}`).join('; ') : ''}`);
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
      const historicoIds: number[] = [];
      const alertaIds: number[] = [];
      const idPorCodigo = new Map(mps.map((m) => [m.codigo, m.id]));

      // 1. MPs novas
      const mpNovaIds: number[] = [];
      for (const m of novas) {
        const preco = m.preco_kg_brl ? new Prisma.Decimal(m.preco_kg_brl).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : null;
        const data = isoParaData(m.data_cotacao);
        const criada = await tx.materiaPrima.create({
          data: {
            codigo: m.mp_codigo,
            nome: m.nome,
            preco_kg_brl: preco,
            fornecedor: m.fornecedor,
            embalagem_minima: m.embalagem_minima,
            data_cotacao: preco ? data : null,
            observacoes:
              `Cadastrada pela extração do Drive (staging ${staging.gerado_em}): código e nome lidos em ${m.n_fotos} foto(s)` +
              `${m.leitura_visual ? ' com leitura visual' : ''}; fórmulas ${m.formulas.join(', ')}.` +
              (preco ? ` Preço da folha, ${ORIGEM_DATA[m.data_origem ?? ''] ?? m.data_origem}.` : m.preco_ambiguo ? ' Sem preço: folhas com preços diferentes na mesma data.' : ' Sem preço na folha (ex.: MP fornecida pelo cliente ou preço rasurado).') +
              ` Conferir cadastro (validado_pd/validado_compras = false). Fonte: ${m.fonte.join(' ; ')}`,
          },
          select: { id: true },
        });
        idPorCodigo.set(m.mp_codigo, criada.id);
        mpNovaIds.push(criada.id);
        if (preco && data) {
          const h = await tx.mpHistoricoPreco.create({
            data: {
              mp_id: criada.id,
              preco_kg_brl: preco,
              fornecedor: m.fornecedor || 'Nao informado',
              data_cotacao: data,
              origem: ORIGEM,
              fonte_info: 'outro',
              observacoes: `Cadastro inicial pela extração do Drive; ${ORIGEM_DATA[m.data_origem ?? ''] ?? m.data_origem}.`,
            },
            select: { id: true },
          });
          historicoIds.push(h.id);
        }
      }

      // 2. fórmulas
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
          arred.length ? `Concentrações arredondadas a 3 casas: ${arred.map((i) => `${i.mp_codigo} ${i.concentracao_pct}→${i.conc.toFixed(3)}`).join(', ')}.` : null,
          f.data_orcamento ? `Data do orçamento: ${f.data_orcamento} (${ORIGEM_DATA[f.data_orcamento_origem ?? ''] ?? f.data_orcamento_origem}).` : null,
          'Preço da folha é snapshot do orçamento.',
          `Fonte: ${fonte}`,
        ].filter(Boolean);
        const nova = await tx.formula.create({
          data: {
            nome_produto: f.nome_produto!,
            cliente_original: f.cliente_original,
            data_criacao: isoParaData(f.data_orcamento),
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
                  mp_id: idPorCodigo.get(it.mp_codigo)!,
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

      // 3. preços (como MateriasPrimasService.atualizarPreco)
      for (const x of aAtualizar) {
        const mp = x.mp!;
        const anterior = mp.preco_kg_brl != null ? Number(mp.preco_kg_brl) : null;
        const dataCotacao = isoParaData(x.p.data_cotacao)!;
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
            observacoes: `Preço de folha de orçamento (fórmula ${x.p.formula} "${x.p.produto ?? ''}"); ${ORIGEM_DATA[x.p.data_origem] ?? x.p.data_origem}. Fonte: ${x.p.fonte}`,
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
            fornecedor: x.trocaFornecedor ? x.p.fornecedor_folha! : mp.fornecedor,
            data_cotacao: dataCotacao,
            flag_aumento_relevante: x.variacao != null && x.variacao >= threshold,
          },
        });
      }

      // 4. alertas (mesmo formato do AlertasService.gerarAlertaAumento; queda = 'variacao_mp')
      if (alertasAtivos) {
        for (const x of altas) {
          const a = await tx.alerta.create({
            data: {
              tipo: 'aumento_mp',
              titulo: `${x.mp!.nome} subiu ${x.variacao!.toFixed(1)}%`,
              mensagem:
                `${x.mp!.nome} subiu ${x.variacao!.toFixed(1)}% (R$${Number(x.mp!.preco_kg_brl).toFixed(2)} → R$${Number(x.novo).toFixed(2)}). ` +
                `Esta MP esta em ${x.mp!.n_formulas_uso} formulas. Fonte: folha de orçamento de ${x.p.data_cotacao} (extração do Drive).`,
              entidade_tipo: 'mp',
              entidade_id: x.mp!.id,
              severidade: x.variacao! >= 50 ? 'critical' : 'warn',
              created_for: PARA_ALERTA,
            },
            select: { id: true },
          });
          alertaIds.push(a.id);
        }
        for (const x of quedas) {
          const a = await tx.alerta.create({
            data: {
              tipo: 'variacao_mp',
              titulo: `${x.mp!.nome} caiu ${Math.abs(x.variacao!).toFixed(1)}%`,
              mensagem:
                `${x.mp!.nome} caiu ${Math.abs(x.variacao!).toFixed(1)}% (R$${Number(x.mp!.preco_kg_brl).toFixed(2)} → R$${Number(x.novo).toFixed(2)}). ` +
                `Esta MP esta em ${x.mp!.n_formulas_uso} formulas. Fonte: folha de orçamento de ${x.p.data_cotacao} (extração do Drive) — conferir se é preço real.`,
              entidade_tipo: 'mp',
              entidade_id: x.mp!.id,
              severidade: x.variacao! <= -50 ? 'warn' : 'info',
              created_for: PARA_ALERTA,
            },
            select: { id: true },
          });
          alertaIds.push(a.id);
        }
        if (novas.length) {
          const a = await tx.alerta.create({
            data: {
              tipo: 'mp_nova',
              titulo: `${novas.length} MPs cadastradas pela extração do Drive`,
              mensagem:
                `Cadastradas a partir das folhas de orçamento (nome/fornecedor lidos por OCR + conferência; validado_pd e validado_compras = false): ` +
                novas.map((m) => `${m.mp_codigo} ${m.nome}`).join('; ').slice(0, 3500),
              entidade_tipo: 'mp',
              severidade: 'info',
              created_for: PARA_ALERTA,
            },
            select: { id: true },
          });
          alertaIds.push(a.id);
        }
      }

      // custo_mp_kg das fórmulas novas com os preços já atualizados — mesma regra de FormulasService.calcularCusto
      for (const id of formulaIds) {
        const comp = await tx.formulaComposicao.findMany({
          where: { formula_id: id },
          select: { concentracao_pct: true, mp: { select: { preco_kg_brl: true } } },
        });
        let total = 0;
        for (const c of comp) {
          if (c.mp?.preco_kg_brl != null && c.concentracao_pct != null) total += (Number(c.concentracao_pct) / 100) * Number(c.mp.preco_kg_brl);
        }
        await tx.formula.update({ where: { id }, data: { custo_mp_kg: Number(total.toFixed(4)) } });
      }
      return { mpNovaIds, formulaIds, historicoIds, alertaIds };
    },
    { timeout: 300_000 },
  );

  const depois = await conta();
  console.log(`\nAplicado: ${res.mpNovaIds.length} MPs novas; ${res.formulaIds.length} fórmulas (${aImportar.reduce((a, p) => a + p.itens.length, 0)} linhas); ${aAtualizar.length} preços atualizados; ${res.historicoIds.length} linhas de histórico; ${res.alertaIds.length} alertas.`);
  console.log(
    `Depois: materias_primas=${depois.mps} (Δ ${depois.mps - baseline.mps}) formulas=${depois.formulas} (Δ ${depois.formulas - baseline.formulas}) ` +
      `formula_composicao=${depois.composicao} (Δ ${depois.composicao - baseline.composicao}) mp_historico_precos=${depois.historico} (Δ ${depois.historico - baseline.historico}) alertas=${depois.alertas} (Δ ${depois.alertas - baseline.alertas})`,
  );

  // rollback .sql (UNTRACKED de propósito — CLAUDE.md regra 3): apaga o criado e devolve cada MP ao estado anterior
  if (!res.mpNovaIds.length && !res.formulaIds.length && !res.historicoIds.length && !res.alertaIds.length) return;
  const lit = (v: unknown) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rb = path.join(__dirname, `rollback-extracao-drive-${ts}.sql`);
  const linhas = [
    `-- Rollback do import-extracao-drive (${ts}): ${res.mpNovaIds.length} MPs novas, ${res.formulaIds.length} fórmulas, ${aAtualizar.length} preços, ${res.alertaIds.length} alertas`,
    `-- Baseline antes: materias_primas=${baseline.mps} formulas=${baseline.formulas} formula_composicao=${baseline.composicao} mp_historico_precos=${baseline.historico} alertas=${baseline.alertas}`,
    'BEGIN;',
  ];
  if (res.alertaIds.length) linhas.push(`DELETE FROM alertas WHERE id IN (${res.alertaIds.join(', ')});`);
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
  // MPs novas por último (depois de apagar fórmulas e histórico que as referenciam)
  if (res.mpNovaIds.length) linhas.push(`DELETE FROM materias_primas WHERE id IN (${res.mpNovaIds.join(', ')});`);
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
