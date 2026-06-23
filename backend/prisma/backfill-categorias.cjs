/* eslint-disable */
// ============================================================================
// BACKFILL DETERMINISTICO DE categoria (Fase 2 — bug do match de formulas).
//
// Preenche formulas.categoria a partir de palavras-chave do nome_produto, via
// whitelist priorizada (vocabulario natural PT). SEM IA, auditavel, reversivel.
//
// O QUE FAZ: para cada formula com categoria NULL (status validada|rascunho),
// normaliza o nome (minuscula + sem acento), tokeniza pelos mesmos separadores
// da calibracao, casa tokens EXATOS contra a whitelist, e escolhe a categoria
// de maior precedencia entre as que casaram. Token desconhecido -> nada.
//
// O QUE NAO FAZ: nao toca status, observacoes, nem qualquer outra coluna.
// So escreve em categoria, e so onde ela esta NULL.
//
// USO:
//   npm run backfill:categorias            -> DRY-RUN (nao grava; imprime
//                                             antes/depois + amostra p/ auditoria)
//   npm run backfill:categorias -- --commit -> aplica os UPDATEs (so categoria),
//                                             grava arquivo de rollback e imprime
//                                             o SQL de reversao.
//
// REVERSIVEL: em --commit, registra os ids tocados e gera
//   prisma/backfill-categorias-rollback-<timestamp>.sql
//   com: UPDATE formulas SET categoria = NULL WHERE id IN (...);
// ============================================================================

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// --- carrega DATABASE_URL do backend/.env (mesma conexao ja validada) -------
const envRaw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
  if (m) {
    process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, '');
    break;
  }
}

// ============================================================================
// DADOS VERSIONADOS — whitelist e precedencia. Editar aqui = unico ponto de
// verdade. (auditoria/reversao de regra: mexe so neste bloco.)
// ============================================================================

// chave (ja normalizada: minuscula, sem acento) -> categoria. Token EXATO.
const WHITELIST = {
  cabelos: [
    'shampoo', 'condicionador', 'capilar', 'progressiva', 'botox', 'leave',
    'keratin', 'keratim', 'cabelo', 'cachos', 'blonder', 'plex', 'antiqueda',
    'queda', 'minoxidil', 'frizz', 'antifrizz', 'desembaracador', 'finalizador',
    'reconstrucao', 'shp', 'cond', 'cab', 'btox',
    // reforço v1.1 (dry-run): protein/ptotein(typo) capilar, reconstrutor, pontas (de cabelo)
    'protein', 'ptotein', 'reconstrutor', 'pontas',
  ],
  skincare: [
    'facial', 'serum', 'hidratante', 'micelar', 'antiaging', 'rugas', 'retinol',
    'antissinais', 'colageno', 'esqualeno', 'pdrn', 'dmae', 'hid',
    'esfoliante', 'esfoliente', 'exfoliante',
    // reforço v1.1 (dry-run): hidrat = abreviacao de hidratante
    'hidrat',
  ],
  solar: ['protetor', 'fps', 'solar', 'filtro'],
  corporal: ['corporal', 'corpo', 'massagem', 'bumbum'],
  maquiagem: ['gloss', 'labial', 'batom', 'baton', 'cilios', 'cilio'],
  perfumaria: ['perfume', 'colonia', 'splash'],
  ambiente: ['ambiente', 'difusor', 'odorizador', 'aromatizador', 'aromatica', 'amb'],
  pet: ['pet', 'patas', 'pata', 'pelagem'],
  barba: ['barba', 'barber', 'barbear'],
  intimo: ['intimo', 'intimate', 'vaginal', 'lubrificante'],
  desodorante: ['desodorante', 'desodrante', 'antiperspirante', 'desod', 'deo'],
};

// precedencia: indice 0 = mais forte. Zona/publico/funcao vencem tipo amplo.
// corporal (9) acima de cabelos/skincare: zona corporal vence tipo de produto.
const PRECEDENCE = [
  'pet', 'intimo', 'barba', 'desodorante', 'solar', 'ambiente',
  'perfumaria', 'maquiagem', 'corporal', 'cabelos', 'skincare',
];

// --- monta o Map plano + guarda anti-colisao (chave em 2 categorias) --------
const KEYWORD_TO_CAT = new Map();
for (const [cat, keys] of Object.entries(WHITELIST)) {
  for (const k of keys) {
    if (KEYWORD_TO_CAT.has(k)) {
      throw new Error(
        `COLISAO de whitelist: "${k}" em "${KEYWORD_TO_CAT.get(k)}" e "${cat}". Abortado.`,
      );
    }
    KEYWORD_TO_CAT.set(k, cat);
  }
}
const PREC_RANK = new Map(PRECEDENCE.map((c, i) => [c, i]));
// toda categoria usada na whitelist precisa existir na precedencia:
for (const cat of Object.keys(WHITELIST)) {
  if (!PREC_RANK.has(cat)) throw new Error(`Categoria "${cat}" sem precedencia. Abortado.`);
}

// ============================================================================
// LOGICA DE CLASSIFICACAO
// ============================================================================

// minuscula + remove diacriticos (NAO depende da extensao unaccent do Postgres)
// range ̀-ͯ = "Combining Diacritical Marks" (acentos decompostos no NFD)
function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// mesmos separadores da calibracao (CONSULTA 1)
const SEP = /[ \t\-/,;:()\.\+%]+/;
function tokenize(nome) {
  return normalize(nome).split(SEP).filter((t) => t.length > 0);
}

// retorna { categoria, matched } — matched = tokens que casaram (auditoria)
function classify(nome) {
  const tokens = tokenize(nome);
  const matched = []; // {token, cat}
  const cats = new Set();
  for (const t of tokens) {
    const cat = KEYWORD_TO_CAT.get(t);
    if (cat) {
      matched.push({ token: t, cat });
      cats.add(cat);
    }
  }
  if (cats.size === 0) return { categoria: null, matched: [], tokens };
  // escolhe por precedencia (menor rank vence) — determinístico
  let escolhida = null;
  for (const c of cats) {
    if (escolhida === null || PREC_RANK.get(c) < PREC_RANK.get(escolhida)) escolhida = c;
  }
  return { categoria: escolhida, matched, tokens };
}

// ============================================================================
// EXECUCAO
// ============================================================================

const COMMIT = process.argv.includes('--commit') || process.argv.includes('--apply');

(async () => {
  const prisma = new PrismaClient();
  try {
    // SANIDADE do regex de diacriticos — prova visual de que o range nao corrompeu
    const provaNorm = normalize('SÉRUM Óleo Intensivo Não-Iônico');
    console.log('=== SANIDADE normalize (range U+0300-U+036F) ===');
    console.log(`  in:  "SÉRUM Óleo Intensivo Não-Iônico"`);
    console.log(`  out: "${provaNorm}"   (esperado: "serum oleo intensivo nao-ionico")\n`);

    // ANTES — distribuicao atual no universo do matcher
    const antes = await prisma.formula.groupBy({
      by: ['categoria'],
      where: { status: { in: ['validada', 'rascunho'] } },
      _count: { _all: true },
    });
    console.log('=== ANTES (status validada|rascunho) ===');
    for (const r of antes.sort((a, b) => b._count._all - a._count._all)) {
      console.log(`  ${r.categoria === null ? '(NULL)' : r.categoria}: ${r._count._all}`);
    }

    // candidatas: so categoria NULL (idempotente; respeita curadoria manual)
    const rows = await prisma.formula.findMany({
      where: { categoria: null, status: { in: ['validada', 'rascunho'] } },
      select: { id: true, nome_produto: true },
      orderBy: { id: 'asc' },
    });

    // classifica
    const plano = []; // {id, nome, categoria, matched}
    const residuais = []; // {id, nome, tokens} — ficaram sem categoria
    for (const r of rows) {
      const { categoria, matched, tokens } = classify(r.nome_produto);
      if (categoria) plano.push({ id: r.id, nome: r.nome_produto, categoria, matched });
      else residuais.push({ id: r.id, nome: r.nome_produto, tokens });
    }

    // PROJETADO — quantos por categoria seriam preenchidos
    const porCat = {};
    for (const p of plano) porCat[p.categoria] = (porCat[p.categoria] || 0) + 1;
    const totalNull = rows.length;
    const totalPreench = plano.length;
    console.log('\n=== PROJETADO (categoria que seria preenchida) ===');
    for (const cat of PRECEDENCE) {
      if (porCat[cat]) console.log(`  ${cat}: ${porCat[cat]}`);
    }
    console.log(`  --- preenche ${totalPreench} de ${totalNull} NULL; ` +
      `restam ${totalNull - totalPreench} NULL (token desconhecido)`);

    // AMOSTRA — ate 3 por categoria, p/ auditar o "porque" linha a linha
    console.log('\n=== AMOSTRA (ate 3 por categoria) ===');
    for (const cat of PRECEDENCE) {
      const exemplos = plano.filter((p) => p.categoria === cat).slice(0, 3);
      for (const e of exemplos) {
        const casados = e.matched.map((m) => m.token).join(', ');
        console.log(`  [${cat}] id=${e.id} "${e.nome}" <- {${casados}}`);
      }
    }

    // NULL RESIDUAIS — lista COMPLETA das que nao casaram (decide se reabrimos
    // a whitelist antes do commit: massa que deveria casar e nao casou por typo/abrev)
    console.log(`\n=== NULL RESIDUAIS (lista completa: ${residuais.length}) ===`);
    for (const r of residuais) {
      console.log(`  id=${r.id} "${r.nome}" -> tokens: {${r.tokens.join(', ')}}`);
    }

    // CASO-TESTEMUNHA — prova documentada de que "stick multifuncional" NAO e
    // curado por categoria (multifuncional=0 no corpus, stick e [F] descartado).
    const tm = classify('Stick Multifuncional');
    console.log('\n=== CASO-TESTEMUNHA (prova documentada) ===');
    console.log(`  classify('Stick Multifuncional') -> categoria=${tm.categoria}, ` +
      `matched=[${tm.matched.map((m) => m.token).join(', ')}]`);
    console.log(`  tokens gerados: {${tm.tokens.join(', ')}}   (esperado: categoria=null, matched vazio)`);

    if (!COMMIT) {
      console.log('\n>>> DRY-RUN: nada foi gravado. Para aplicar: npm run backfill:categorias -- --commit');
      return;
    }

    // ---- COMMIT: aplica UPDATEs (so categoria, so onde NULL) ----------------
    const idsPorCat = {};
    for (const p of plano) (idsPorCat[p.categoria] = idsPorCat[p.categoria] || []).push(p.id);

    // 1) PRIMEIRO grava o rollback em disco. Os ids vêm de `plano` (calculado na
    //    classificacao, ANTES do UPDATE) — o conteudo NAO depende do resultado da
    //    transacao. Se o writeFileSync falhar, abortamos sem ter tocado o banco.
    const idsTocados = plano.map((p) => p.id).sort((a, b) => a - b);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rollbackSql =
      `-- Rollback do backfill de categoria — ${idsTocados.length} ids tocados — ${ts}\n` +
      `UPDATE formulas SET categoria = NULL WHERE id IN (${idsTocados.join(', ')});\n`;
    const rollbackPath = path.join(__dirname, `backfill-categorias-rollback-${ts}.sql`);
    fs.writeFileSync(rollbackPath, rollbackSql, 'utf8');
    console.log(`>>> Rollback gravado ANTES do UPDATE em: ${rollbackPath}`);

    // 2) SO ENTAO aplica os UPDATEs em transacao (so categoria, so onde NULL)
    const ops = Object.entries(idsPorCat).map(([cat, ids]) =>
      prisma.formula.updateMany({
        where: { id: { in: ids }, categoria: null }, // guard idempotente
        data: { categoria: cat },
      }),
    );
    const resultados = await prisma.$transaction(ops);
    const totalGravado = resultados.reduce((s, r) => s + r.count, 0);

    console.log(`\n>>> COMMIT: ${totalGravado} linhas atualizadas (so coluna categoria).`);
    console.log('>>> SQL de reversao:\n' + rollbackSql);

    // DEPOIS — confirma distribuicao final
    const depois = await prisma.formula.groupBy({
      by: ['categoria'],
      where: { status: { in: ['validada', 'rascunho'] } },
      _count: { _all: true },
    });
    console.log('=== DEPOIS (status validada|rascunho) ===');
    for (const r of depois.sort((a, b) => b._count._all - a._count._all)) {
      console.log(`  ${r.categoria === null ? '(NULL)' : r.categoria}: ${r._count._all}`);
    }
  } catch (e) {
    console.error('ERRO:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
