/**
 * INTEGRACAO OMIE -> STUDIO: materias-primas e preco da ULTIMA COMPRA.
 *
 *   node prisma/sync-omie-mp.cjs                       # DRY-RUN: mostra o plano e grava o relatorio
 *   node prisma/sync-omie-mp.cjs --commit              # aplica (com backup automatico em prisma/backup-sync-omie-mp-<ts>.json)
 *   --arquivo=<caminho do studio-mp-omie.json>         # padrao: C:\Users\TI\Documents\Faturamento Private\dados\studio-mp-omie.json
 *   --relatorio=<caminho .json>                        # padrao: prisma/relatorio-sync-omie-mp.json
 *
 * Entrada: dados/studio-mp-omie.json gerado por "node studio/exportar-mp-omie.mjs" no robo
 * (Faturamento Private): catalogo de MP do Omie + ultima NF de COMPRA de cada codigo
 * (valor com ICMS/IPI/ST / quantidade recebida, na unidade da NF).
 *
 * O que faz, nesta ordem (tudo numa transacao unica quando --commit):
 *  1. Pareia cada codigo do Omie com uma MP do Studio: vinculo ja gravado > override do
 *     mapa (prisma/omie-mp-mapa.json) > nome normalizado igual > semelhanca >= limiar
 *     (fora dos "bloqueados") > sem par: CRIA a MP se o codigo e PRD* ou se tem compra;
 *     senao fica "sem_vinculo" (material de cliente sem compra nao entra no catalogo).
 *  2. Converte a ultima compra para R$/kg (KG direto; G/GR x1000; UN com peso na
 *     descricao, ex. "1KG"/"500g", pelo peso; L/mL ou UN sem peso: SEM preco + motivo).
 *  3. Para cada MP com compra em R$/kg: o codigo com a compra MAIS RECENTE vira o
 *     "principal" e o preco da MP passa a ser o da ultima compra SE a NF for mais recente
 *     que a cotacao gravada (regra de 23/10/2026; cotacao igual/mais nova prevalece) — gravando historico
 *     (origem integracao_omie, fonte ultima_compra), audit_log e alerta de aumento
 *     (mesma regra de MateriasPrimasService.atualizarPreco). Guarda de outlier: variacao
 *     acima de x5 ou abaixo de /5 NAO e aplicada (fica "suspeito" no relatorio) salvo
 *     override.forcar_preco — regra 6/7: numero estranho aparece, nao entra em silencio.
 *  4. Grava/atualiza mp_omie_vinculos para TODOS os codigos (inclusive sem vinculo).
 *
 * Idempotente: rodar de novo sem compra nova nao grava nada.
 * Rollback: prisma/rollback-sync-omie-mp.cjs --backup=<arquivo gerado>.
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const COMMIT = argv.includes('--commit');
const arg = (k, d) => (argv.find((a) => a.startsWith(`--${k}=`)) ?? '').slice(k.length + 3) || d;
const ARQUIVO = arg('arquivo', 'C:\\Users\\TI\\Documents\\Faturamento Private\\dados\\studio-mp-omie.json');
const RELATORIO = arg('relatorio', path.join(__dirname, 'relatorio-sync-omie-mp.json'));
const MAPA = JSON.parse(fs.readFileSync(path.join(__dirname, 'omie-mp-mapa.json'), 'utf8'));
const LIMIAR = MAPA.limiar_similaridade ?? 0.85;
const BLOQUEADOS = new Set(MAPA.bloqueados ?? []);
const OVERRIDES = MAPA.overrides ?? {};
const OUTLIER_SOBE = 5; // novo > 5x atual
const OUTLIER_CAI = 0.2; // novo < atual/5

// ------------------------------------------------------------ normalizacao / semelhanca
const SYN = {
  oleo: 'oleo', sodium: 'sodio', potassium: 'potassio', acid: 'acido', alcohol: 'alcool', glic: 'glicolico', glycolic: 'glicolico',
  ext: 'extrato', extract: 'extrato', hydroxide: 'hidroxido', fragrancia: 'essencia', fragrance: 'essencia', essential: 'essencial', oil: 'oleo',
  water: 'agua', cetearyl: 'cetoestearilico', cetyl: 'cetilico', stearic: 'estearico', mamona: 'ricino', castor: 'ricino', ethoxylated: 'etoxilado',
  mols: 'moles', mol: 'moles', coconut: 'coco', hydrolyzed: 'hidrolisada', keratin: 'queratina', collagen: 'colageno',
  corante: '', pigmento: '', color: '', liquido: '', liquida: '', po: '', em: '', granular: '', escama: '', escamas: '', flocos: '', refinado: '', refinada: '',
  usp: '', pa: '', puro: '', pura: '', natural: '', organico: '', organica: '', anfotero: '', private: '', pvt: '', mp: '', nova: '', novo: '', new: '',
  cosmeticos: '', cosmedical: '', mc: '',
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/\b(private|pvt)\b/g, ' ')
  .replace(/[()\[\],.;:/\\%"'`´*+&|]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
const toks = (s) => {
  const out = [];
  for (let t of norm(s).split(' ')) {
    if (!t) continue;
    if (/^\d+$/.test(t) && t.length <= 2) continue;
    t = t.replace(/s$/, '');
    if (t in SYN) { t = SYN[t]; if (!t) continue; }
    if (t.length < 2) continue;
    out.push(t);
  }
  return out;
};
const compact = (s) => toks(s).join('');
const bigrams = (t) => { const b = new Map(); for (let i = 0; i < t.length - 1; i++) { const k = t.slice(i, i + 2); b.set(k, (b.get(k) || 0) + 1); } return b; };
const dice = (a, b) => { let inter = 0, na = 0, nb = 0; for (const v of a.values()) na += v; for (const v of b.values()) nb += v; for (const [k, v] of a) if (b.has(k)) inter += Math.min(v, b.get(k)); return na + nb ? (2 * inter) / (na + nb) : 0; };
const jacc = (a, b) => { const A = new Set(a), B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; const u = A.size + B.size - i; return u ? i / u : 0; };
const contain = (a, b) => { const A = new Set(a), B = new Set(b); const [s, l] = A.size <= B.size ? [A, B] : [B, A]; if (!s.size) return 0; let i = 0; for (const x of s) if (l.has(x)) i++; return i / s.size; };

/** Nome "limpo" para MP criada a partir do Omie (tira sufixos de dono/cliente). */
function nomeLimpo(desc) {
  return String(desc).replace(/&amp;/g, '&').replace(/&apos;/g, "'")
    .replace(/\s*[-–(]\s*(private|pvt|nova cosm[eé]ticos|nova|cosmedical|mc)\s*\)?\s*$/i, '')
    .replace(/\s{2,}/g, ' ').trim();
}

// ------------------------------------------------------------ conversao da ultima compra para R$/kg
const UN = (u) => ({ KILO: 'KG', KILOS: 'KG', KGS: 'KG', GR: 'G', GRS: 'G', GRAMA: 'G', GRAMAS: 'G', LT: 'L', LTS: 'L', LITRO: 'L', LITROS: 'L', UND: 'UN', UNID: 'UN', PC: 'UN', PCS: 'UN', PÇ: 'UN', PECA: 'UN', PEÇA: 'UN', FR: 'UN', FRASCO: 'UN', BD: 'UN', BALDE: 'UN', SC: 'UN', SACO: 'UN', CX: 'UN', TON: 'TON', T: 'TON' }[u] ?? u);
function precoKg(compra, descricao) {
  if (!compra) return { preco_kg: null, motivo: 'sem compra registrada no Omie' };
  const u = UN(String(compra.un || '').toUpperCase());
  const p = Number(compra.unitario);
  if (!(p > 0)) return { preco_kg: null, motivo: 'valor unitario zero na NF' };
  if (u === 'KG') return { preco_kg: p, conversao: null };
  if (u === 'G') return { preco_kg: p * 1000, conversao: 'G -> KG (x1000)' };
  if (u === 'TON') return { preco_kg: p / 1000, conversao: 'TON -> KG (/1000)' };
  if (u === 'L' || u === 'ML') return { preco_kg: null, motivo: `unidade de volume (${u}) sem densidade cadastrada` };
  // UN com peso na descricao: "1KG", "500 g", "FRA1KG", "BD1KG"
  const m = String(descricao).match(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
  if (m) {
    const n = Number(m[1].replace(',', '.'));
    const kg = m[2].toLowerCase() === 'kg' ? n : n / 1000;
    if (kg > 0) return { preco_kg: p / kg, conversao: `${u} de ${m[1]} ${m[2]} -> KG (/${kg})` };
  }
  return { preco_kg: null, motivo: `unidade ${u} sem peso na descricao` };
}
const r4 = (n) => Number(Number(n).toFixed(4));
const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

// ------------------------------------------------------------ principal
(async () => {
  const entrada = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
  const itens = entrada.itens;
  console.log(`Entrada: ${itens.length} MPs do Omie (gerado em ${entrada.gerado_em}; ultima NF de entrada ${entrada.fonte?.ultima_nf_entrada})`);

  // antes do deploy da migration 20261023100000 a tabela de vinculos nao existe: o DRY-RUN segue com lista vazia; o COMMIT exige a tabela
  const lerVinculos = () => prisma.mpOmieVinculo.findMany().catch((e) => {
    if (e?.code !== 'P2021') throw e;
    if (COMMIT) throw new Error('Tabela mp_omie_vinculos nao existe neste banco: aplique a migration 20261023100000_omie_vinculo_viabilidade (prisma migrate deploy) antes do --commit.');
    console.warn('AVISO: tabela mp_omie_vinculos ainda nao existe (migration pendente) — dry-run sem vinculos anteriores.');
    return [];
  });
  const [mps, vinculos, cfg, admin] = await Promise.all([
    prisma.materiaPrima.findMany({ orderBy: { codigo: 'asc' } }),
    lerVinculos(),
    prisma.systemConfig.findUnique({ where: { id: 1 } }),
    prisma.user.findFirst({ where: { role: 'admin', ativo: true }, select: { id: true, nome: true } }),
  ]);
  const threshold = cfg ? Number(cfg.alerta_aumento_mp_pct) : 20;
  const alertasAtivos = cfg ? cfg.alertas_ativos : true;
  const porId = new Map(mps.map((m) => [m.id, m]));
  const porCodigo = new Map(mps.map((m) => [m.codigo, m]));
  const vincPorOmie = new Map(vinculos.map((v) => [v.codigo_omie, v]));
  const idx = mps.map((m) => ({ m, c: compact(m.nome), t: toks(m.nome), b: bigrams(compact(m.nome)) }));
  let proximoCodigo = Math.max(0, ...mps.map((m) => m.codigo)) + 1;

  // ---- 1. pareamento ----
  const plano = []; // um por codigo do Omie
  const novasPorGrupo = new Map(); // grupo -> { nome, codigo, itens[] }
  for (const it of itens) {
    const ov = OVERRIDES[it.codigo];
    const existente = vincPorOmie.get(it.codigo);
    const conv = precoKg(it.compra, it.descricao);
    const linha = { omie: it, vinculo_existente: existente ?? null, conv, mp: null, acao: null, origem: null, score: null, detalhe: null };

    if (ov?.acao === 'ignorar') { linha.acao = 'ignorar'; linha.origem = 'ignorado'; linha.detalhe = ov.motivo; plano.push(linha); continue; }
    if (existente?.mp_id && porId.has(existente.mp_id) && !(ov?.acao === 'vincular' && porCodigo.get(ov.studio)?.id !== existente.mp_id)) {
      linha.mp = porId.get(existente.mp_id); linha.acao = 'manter'; linha.origem = existente.origem; linha.score = existente.score != null ? Number(existente.score) : null; plano.push(linha); continue;
    }
    if (ov?.acao === 'vincular') {
      const alvo = porCodigo.get(ov.studio);
      if (!alvo) { linha.acao = 'erro'; linha.detalhe = `override aponta para codigo Studio ${ov.studio} inexistente`; plano.push(linha); continue; }
      linha.mp = alvo; linha.acao = 'vincular'; linha.origem = 'manual'; linha.score = 1; linha.detalhe = ov.motivo ?? null; plano.push(linha); continue;
    }
    if (ov?.acao === 'criar') {
      const grupo = ov.grupo ?? `_${it.codigo}`;
      let g = novasPorGrupo.get(grupo);
      if (!g) { g = { grupo, nome: ov.nome ?? nomeLimpo(it.descricao), codigo: proximoCodigo++, itens: [] }; novasPorGrupo.set(grupo, g); }
      g.itens.push(linha); linha.acao = 'criar'; linha.origem = 'criado_do_omie'; linha.detalhe = g; plano.push(linha); continue;
    }
    // automatico: exato > semelhanca
    const c = compact(it.descricao), t = toks(it.descricao), b = bigrams(c);
    let best = null;
    for (const s of idx) {
      let sc;
      if (s.c === c && c) sc = 1;
      else { const d = dice(b, s.b), j = jacc(t, s.t), ct = contain(t, s.t); sc = Math.max(0.65 * d + 0.35 * j, ct >= 0.999 && Math.min(t.length, s.t.length) >= 2 ? 0.86 + 0.1 * j : 0); }
      if (sc < 1 && BLOQUEADOS.has(s.m.codigo)) continue; // generico: so por igualdade exata
      if (!best || sc > best.sc) best = { s, sc };
    }
    if (best && best.sc >= 0.999) { linha.mp = best.s.m; linha.acao = 'vincular'; linha.origem = 'auto_exato'; linha.score = 1; plano.push(linha); continue; }
    if (best && best.sc >= LIMIAR) { linha.mp = best.s.m; linha.acao = 'vincular'; linha.origem = 'auto_similar'; linha.score = r4(best.sc); plano.push(linha); continue; }
    linha.score = best ? r4(best.sc) : 0;
    if (/^PRD/i.test(it.codigo) || it.compra) {
      const grupo = `_${it.codigo}`;
      const g = { grupo, nome: nomeLimpo(it.descricao), codigo: proximoCodigo++, itens: [linha] };
      novasPorGrupo.set(grupo, g); linha.acao = 'criar'; linha.origem = 'criado_do_omie'; linha.detalhe = g;
    } else { linha.acao = 'sem_vinculo'; linha.origem = 'sem_vinculo'; linha.detalhe = best ? `melhor candidato ${best.s.m.codigo} ${best.s.m.nome} (${r4(best.sc)})` : null; }
    plano.push(linha);
  }

  // ---- 2/3. preco por MP (a compra mais recente entre os codigos vinculados; PRD desempata) ----
  const porMp = new Map(); // chave: 'mp:<id>' ou 'novo:<grupo>'
  for (const l of plano) {
    if (!['manter', 'vincular', 'criar'].includes(l.acao)) continue;
    const chave = l.acao === 'criar' ? `novo:${l.detalhe.grupo}` : `mp:${l.mp.id}`;
    const g = porMp.get(chave) ?? { chave, mp: l.mp ?? null, novo: l.acao === 'criar' ? l.detalhe : null, linhas: [] };
    g.linhas.push(l); porMp.set(chave, g);
  }
  const precos = [];
  for (const g of porMp.values()) {
    const candidatas = g.linhas.filter((l) => l.omie.compra && l.conv.preco_kg != null)
      .sort((a, b) => (b.omie.compra.data.localeCompare(a.omie.compra.data)) || ((/^PRD/i.test(a.omie.codigo) ? 0 : 1) - (/^PRD/i.test(b.omie.codigo) ? 0 : 1)));
    g.principal = candidatas[0] ?? null;
    if (!g.principal) continue;
    const l = g.principal; const compra = l.omie.compra; const novo = r4(l.conv.preco_kg);
    const atual = g.mp?.preco_kg_brl != null ? Number(g.mp.preco_kg_brl) : null;
    const dataAtual = g.mp?.data_cotacao ? g.mp.data_cotacao.toISOString().slice(0, 10) : null;
    const variacao = atual != null && atual > 0 ? Number((((novo - atual) / atual) * 100).toFixed(2)) : null;
    const igual = atual != null && Math.abs(atual - novo) < 0.00005 && dataAtual === compra.data;
    const ov = OVERRIDES[l.omie.codigo];
    const outlier = atual != null && atual > 0 && (novo / atual > OUTLIER_SOBE || novo / atual < OUTLIER_CAI) && !ov?.forcar_preco;
    // REGRA (decisao do dono, 23/10/2026): a compra so substitui o preco quando a NF e MAIS RECENTE que a
    // cotacao gravada no Studio. Cotacao de mesma data ou mais nova prevalece (fica registrada no relatorio).
    const cotacaoMaisRecente = !igual && atual != null && dataAtual != null && compra.data <= dataAtual;
    const aplicar = !igual && !outlier && !cotacaoMaisRecente;
    precos.push({ grupo: g, linha: l, compra, novo, atual, dataAtual, variacao, igual, outlier, cotacaoMaisRecente, aplicar, aumentoRelevante: variacao != null && variacao >= threshold });
  }

  // ---- resumo do plano ----
  const cont = (arr, f) => arr.reduce((a, x) => { const k = f(x); a[k] = (a[k] || 0) + 1; return a; }, {});
  const resumo = {
    por_acao: cont(plano, (l) => l.acao),
    por_origem: cont(plano, (l) => l.origem),
    mps_novas: novasPorGrupo.size,
    precos: { candidatos: precos.length, aplicar: precos.filter((p) => p.aplicar).length, sem_mudanca: precos.filter((p) => p.igual).length, cotacao_mais_recente_mantida: precos.filter((p) => p.cotacaoMaisRecente && !p.outlier).length, suspeitos_outlier: precos.filter((p) => p.outlier).length, aumento_relevante: precos.filter((p) => p.aplicar && p.aumentoRelevante).length },
    sem_preco_kg: cont(plano.filter((l) => l.omie.compra && l.conv.preco_kg == null), (l) => l.conv.motivo),
  };
  console.log('\nPLANO', COMMIT ? '(COMMIT)' : '(DRY-RUN)');
  console.log(JSON.stringify(resumo, null, 1));
  console.log('\nPrecos a aplicar (amostra de 25):');
  for (const p of precos.filter((p) => p.aplicar).slice(0, 25)) console.log(`  ${p.grupo.mp ? p.grupo.mp.codigo + ' ' + p.grupo.mp.nome : 'NOVA ' + p.grupo.novo.nome} : R$ ${p.atual ?? '—'} (${p.dataAtual ?? 's/ data'}) -> R$ ${p.novo} (${p.compra.data}, NF ${p.compra.nf}, ${p.compra.fornecedor.slice(0, 25)})${p.variacao != null ? ' ' + p.variacao + '%' : ''}`);
  console.log('\nSUSPEITOS (outlier — NAO aplicados; use forcar_preco no mapa se estiver certo):');
  for (const p of precos.filter((p) => p.outlier)) console.log(`  ${p.grupo.mp.codigo} ${p.grupo.mp.nome}: R$ ${p.atual} -> R$ ${p.novo} (${p.variacao}%) via ${p.linha.omie.codigo} NF ${p.compra.nf} ${p.compra.qtde} ${p.compra.un}`);
  const erros = plano.filter((l) => l.acao === 'erro');
  if (erros.length) { console.log('\nERROS no mapa:'); erros.forEach((l) => console.log(`  ${l.omie.codigo}: ${l.detalhe}`)); }

  // relatorio completo (JSON) — serve de base para a auditoria
  const relatorio = {
    gerado_em: new Date().toISOString(), commit: COMMIT, entrada: entrada.fonte, resumo,
    linhas: plano.map((l) => ({
      omie: l.omie.codigo, omie_id: l.omie.omie_id, descricao: l.omie.descricao, un: l.omie.un, ncm: l.omie.ncm, acao: l.acao, origem: l.origem, score: l.score,
      studio: l.mp ? { id: l.mp.id, codigo: l.mp.codigo, nome: l.mp.nome, preco: l.mp.preco_kg_brl != null ? Number(l.mp.preco_kg_brl) : null, data: l.mp.data_cotacao?.toISOString().slice(0, 10) ?? null, uso: l.mp.n_formulas_uso } : l.acao === 'criar' ? { novo: true, codigo: l.detalhe.codigo, nome: l.detalhe.nome, grupo: l.detalhe.grupo } : null,
      compra: l.omie.compra, preco_kg: l.conv.preco_kg != null ? r4(l.conv.preco_kg) : null, conversao: l.conv.conversao ?? null, motivo_sem_preco: l.conv.motivo ?? null,
      detalhe: typeof l.detalhe === 'string' ? l.detalhe : null,
    })),
    precos: precos.map((p) => ({ studio: p.grupo.mp ? { id: p.grupo.mp.id, codigo: p.grupo.mp.codigo, nome: p.grupo.mp.nome, uso: p.grupo.mp.n_formulas_uso } : { novo: true, codigo: p.grupo.novo.codigo, nome: p.grupo.novo.nome }, omie: p.linha.omie.codigo, atual: p.atual, data_atual: p.dataAtual, novo: p.novo, data_nova: p.compra.data, variacao_pct: p.variacao, nf: p.compra.nf, fornecedor: p.compra.fornecedor, qtde: p.compra.qtde, un: p.compra.un, conversao: p.linha.conv.conversao ?? null, situacao: p.igual ? 'sem_mudanca' : p.outlier ? 'suspeito_nao_aplicado' : p.cotacaoMaisRecente ? 'cotacao_mais_recente_mantida' : 'aplicar', aumento_relevante: p.aumentoRelevante })),
  };
  fs.writeFileSync(RELATORIO, JSON.stringify(relatorio, null, 1));
  console.log(`\nRelatorio: ${RELATORIO}`);

  if (!COMMIT) { console.log('\nDRY-RUN — nada gravado. Rode com --commit para aplicar.'); await prisma.$disconnect(); return; }
  if (erros.length) throw new Error('Corrija os erros do mapa antes de aplicar.');

  // ---- backup (antes de qualquer escrita) ----
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const afetadas = [...new Set(precos.filter((p) => p.aplicar && p.grupo.mp).map((p) => p.grupo.mp.id))];
  const [maxHist, maxAlerta, maxAudit] = await Promise.all([
    prisma.mpHistoricoPreco.aggregate({ _max: { id: true } }), prisma.alerta.aggregate({ _max: { id: true } }), prisma.auditLog.aggregate({ _max: { id: true } }),
  ]);
  const backup = {
    gerado_em: new Date().toISOString(), arquivo_entrada: ARQUIVO,
    materias_primas_antes: mps.filter((m) => afetadas.includes(m.id)),
    vinculos_antes: vinculos,
    max_ids_antes: { mp_historico_precos: maxHist._max.id ?? 0, alertas: maxAlerta._max.id ?? 0, audit_log: maxAudit._max.id ?? 0, materias_primas_max_codigo: Math.max(0, ...mps.map((m) => m.codigo)) },
    mps_novas_codigos: [...novasPorGrupo.values()].map((g) => g.codigo),
  };
  const arqBackup = path.join(__dirname, `backup-sync-omie-mp-${ts}.json`);
  fs.writeFileSync(arqBackup, JSON.stringify(backup, null, 1));
  console.log(`Backup: ${arqBackup}`);

  // ---- escrita (transacao unica) ----
  const agora = new Date();
  const resultado = { mps_criadas: 0, precos_aplicados: 0, alertas: 0, vinculos: 0 };
  await prisma.$transaction(async (tx) => {
    // a) MPs novas
    const idNovo = new Map(); // grupo -> id
    for (const g of novasPorGrupo.values()) {
      const grupo = porMp.get(`novo:${g.grupo}`);
      const principal = grupo?.principal ?? null;
      const compra = principal?.omie.compra ?? null;
      const preco = principal ? r4(principal.conv.preco_kg) : null;
      const codigos = g.itens.map((l) => l.omie.codigo).join(', ');
      const mp = await tx.materiaPrima.create({
        data: {
          codigo: g.codigo, nome: g.nome, preco_kg_brl: preco, fornecedor: compra?.fornecedor ?? null,
          data_cotacao: compra ? new Date(compra.data) : null, n_formulas_uso: 0,
          observacoes: `Importada do Omie (${codigos}) em ${dataBR(agora.toISOString())}.${compra ? '' : ' Sem compra registrada no Omie: sem preco.'}`,
        },
      });
      idNovo.set(g.grupo, mp.id);
      resultado.mps_criadas++;
      if (preco != null) {
        await tx.mpHistoricoPreco.create({ data: { mp_id: mp.id, preco_kg_brl: preco, fornecedor: compra.fornecedor, data_cotacao: new Date(compra.data), origem: 'integracao_omie', fonte_info: 'ultima_compra', observacoes: `NF ${compra.nf} de ${dataBR(compra.data)} - ${compra.qtde} ${compra.un} a R$ ${compra.unitario}/${compra.un} (com ICMS/IPI/ST) - Omie ${principal.omie.codigo}${principal.conv.conversao ? ' - ' + principal.conv.conversao : ''}`, registrado_por: admin?.id ?? null } });
        resultado.precos_aplicados++;
      }
      await tx.auditLog.create({ data: { user_id: admin?.id ?? null, acao: 'integracao_omie_criar_mp', entidade: 'materia_prima', entidade_id: String(mp.codigo), detalhes: { nome: g.nome, omie: codigos, preco, data: compra?.data ?? null } } });
    }
    // b) precos nas MPs existentes
    for (const p of precos) {
      if (!p.aplicar || !p.grupo.mp) continue;
      const mp = p.grupo.mp; const compra = p.compra;
      await tx.mpHistoricoPreco.create({ data: { mp_id: mp.id, preco_kg_brl: p.novo, preco_anterior_kg: p.atual ?? undefined, variacao_pct: p.variacao ?? undefined, fornecedor: compra.fornecedor, data_cotacao: new Date(compra.data), origem: 'integracao_omie', fonte_info: 'ultima_compra', observacoes: `NF ${compra.nf} de ${dataBR(compra.data)} - ${compra.qtde} ${compra.un} a R$ ${compra.unitario}/${compra.un} (com ICMS/IPI/ST) - Omie ${p.linha.omie.codigo}${p.linha.conv.conversao ? ' - ' + p.linha.conv.conversao : ''}`, registrado_por: admin?.id ?? null } });
      await tx.materiaPrima.update({ where: { id: mp.id }, data: { preco_anterior: p.atual ?? undefined, preco_kg_brl: p.novo, aumento_pct: p.variacao ?? undefined, fornecedor: compra.fornecedor, data_cotacao: new Date(compra.data), flag_aumento_relevante: p.aumentoRelevante } });
      await tx.auditLog.create({ data: { user_id: admin?.id ?? null, acao: 'integracao_omie_preco_mp', entidade: 'materia_prima', entidade_id: String(mp.codigo), detalhes: { de: p.atual, para: p.novo, variacao_pct: p.variacao, omie: p.linha.omie.codigo, nf: compra.nf, data: compra.data, fornecedor: compra.fornecedor } } });
      resultado.precos_aplicados++;
      if (p.aumentoRelevante && alertasAtivos && p.atual != null) {
        await tx.alerta.create({ data: { tipo: 'aumento_mp', titulo: `${mp.nome} subiu ${p.variacao.toFixed(1)}%`, mensagem: `${mp.nome} subiu ${p.variacao.toFixed(1)}% (R$${p.atual.toFixed(2)} -> R$${p.novo.toFixed(2)}) pela ultima compra no Omie (NF ${compra.nf}, ${dataBR(compra.data)}). Esta MP esta em ${mp.n_formulas_uso} formulas.`, entidade_tipo: 'mp', entidade_id: mp.id, severidade: p.variacao >= 50 ? 'critical' : 'warn', created_for: ['comercial', 'pd', 'admin'] } });
        resultado.alertas++;
      }
    }
    // c) vinculos
    for (const l of plano) {
      if (l.acao === 'erro') continue;
      const mpId = l.acao === 'criar' ? idNovo.get(l.detalhe.grupo) : l.mp?.id ?? null;
      const grupoChave = l.acao === 'criar' ? `novo:${l.detalhe.grupo}` : l.mp ? `mp:${l.mp.id}` : null;
      const principal = grupoChave ? porMp.get(grupoChave)?.principal === l : false;
      const compra = l.omie.compra ? { ...l.omie.compra, preco_kg: l.conv.preco_kg != null ? r4(l.conv.preco_kg) : null, conversao: l.conv.conversao ?? null } : null;
      const data = { omie_id: l.omie.omie_id, descricao_omie: l.omie.descricao, unidade_omie: l.omie.un ?? null, ncm_omie: l.omie.ncm ?? null, familia_omie: l.omie.familia ?? null, mp_id: mpId, principal, origem: l.origem, score: l.score, ultima_compra: compra, motivo_sem_preco: l.omie.compra ? l.conv.motivo ?? null : 'sem compra registrada no Omie', sincronizado_em: agora };
      await tx.mpOmieVinculo.upsert({ where: { codigo_omie: l.omie.codigo }, create: { codigo_omie: l.omie.codigo, ...data }, update: data });
      resultado.vinculos++;
    }
    await tx.auditLog.create({ data: { user_id: admin?.id ?? null, acao: 'integracao_omie_sincronizacao', entidade: 'materia_prima', entidade_id: null, detalhes: { ...resultado, resumo, backup: path.basename(arqBackup), entrada: entrada.fonte } } });
  }, { timeout: 15 * 60 * 1000, maxWait: 30 * 1000 });

  console.log('\nAPLICADO:', resultado);
  console.log(`Rollback: node prisma/rollback-sync-omie-mp.cjs --backup=${arqBackup}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
