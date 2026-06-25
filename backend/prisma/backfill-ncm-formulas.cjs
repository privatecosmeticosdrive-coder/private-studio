/* eslint-disable */
// ============================================================================
// BACKFILL DETERMINISTICO de formulas.ncm_id (Fase 3.5 — derivacao por token).
//
// A MAQUINA deriva o NCM de cada formula a partir de palavras-chave do
// nome_produto e grava ncm_id MANTENDO ncm_revisado=false. Isto NAO e a revisao
// humana (essa e a F5/tela): aqui so propomos a associacao formula->NCM, que o
// humano confirma depois (ncm_revisado vira true). SEM IA, auditavel, reversivel.
//
// O QUE FAZ: para cada formula com ncm_id NULL, normaliza o nome (mesma
// normalize()+tokenize()+SEP do backfill de categorias — consistencia exigida),
// casa tokens EXATOS contra MAPA_TOKEN_NCM, aplica as regras (barbear>barba,
// pet ignorado, conflito=>NULL) e, se sobrar UM unico ncm_id, grava-o.
//
// O QUE NAO FAZ: nao toca ncm_revisado (fica false), nao sobrescreve ncm_id ja
//   preenchido (idempotente; respeita associacao ja feita ou revisada), nao
//   altera nenhuma outra coluna. Conflito (2+ NCMs) ou nenhum token => deixa NULL.
//
// USO:
//   npm run backfill:ncm             -> DRY-RUN (nao grava; imprime o plano)
//   npm run backfill:ncm -- --commit -> aplica os UPDATEs (so ncm_id, so onde
//                                       NULL), grava rollback ANTES e loga em
//                                       matriz_custo_historico.
//
// REVERSIVEL: em --commit grava prisma/matriz-custo-f35-rollback-<timestamp>.sql
//   com: UPDATE formulas SET ncm_id = NULL WHERE id IN (...);  (so as que ESTE
//   backfill tocou). MANTEM as linhas de log (verdade historica permanente).
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
// DADOS VERSIONADOS — mapa token->codigo NCM. Unico ponto de verdade.
// (Opcao 3: const isolada, extraivel pra tabela no futuro.) Match e TOKEN
// EXATO, nao substring — os tokens sao listados como aparecem isolados apos
// normalize()+tokenize(). O codigo NCM (string, com sufixo -ExNN quando houver)
// e resolvido pro id da tabela `ncm` no inicio da execucao.
// ============================================================================

const MAPA_TOKEN_NCM = {
  barbear:         '3307.10.00',      // id esperado 18 (IPI 14,3)
  barba:           '3305.90.00-Ex01', // id 17 (IPI 4,55)
  condicionador:   '3305.90.00-Ex01', // id 17
  xampu:           '3305.10.00',      // id 13
  shampoo:         '3305.10.00',      // id 13
  shp:             '3305.10.00',      // id 13 — abreviacao de shampoo
  botox:           '3305.20.00',      // id 14
  progressiva:     '3305.20.00',      // id 14
  alisamento:      '3305.20.00',      // id 14
  splash:          '3307.20.10',      // id 19
  colonia:         '3307.20.10',      // id 19
  desodorante:     '3307.20.10',      // id 19
  antiperspirante: '3307.20.10',      // id 19
  esmalte:         '3304.30.00',      // id 6
  gloss:           '3304.10.00',      // id 3 — maquiagem labios (IPI 14,3)
  labial:          '3304.10.00',      // id 3
  // 'protetor' e 'fps' removidos: genericos isolados. Antissolar so via par
  // protetor+solar (MAPA_PAR). Protetor Labial casa 'labial' -> id 3. Hidratante FPS -> NULL.
  aromatizador:    '3307.49.00',      // id 23 (IPI 22)
  difusor:         '3307.49.00',      // id 23
};

// REGRA DE PAR — LISTA de regras independentes. Cada regra so deriva quando um de
// SEUS gatilhos E o SEU qualificador aparecem juntos nos tokens. Sem casamento
// cruzado entre regras (sabonete nunca casa 'solar'; protetor nunca casa 'barra').
// O id entra no MESMO conjunto de ids distintos, integrando com a logica de conflito.
const MAPA_PAR = [
  { gatilhos: ['sabonete', 'sab'], qualificador: 'liquido', code: '3401.30.00' }, // id 31 sabonete liquido (6,5)
  { gatilhos: ['sabonete', 'sab'], qualificador: 'barra',   code: '3401.11.90' }, // id 26 sabonete barra (3,25)
  { gatilhos: ['protetor'],        qualificador: 'solar',   code: '3304.99.90-Ex02' }, // id 12 antissolar (0) — so protetor+solar
];

// ============================================================================
// NORMALIZACAO / TOKENIZACAO — copiada VERBATIM do backfill de categorias
// (backfill-categorias.cjs) para garantir consistencia de tokenizacao entre
// os dois backfills. NAO editar aqui isoladamente.
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

// ============================================================================
// LOGICA DE DERIVACAO
// ============================================================================

// Monta o Map token->codigo (chaves de objeto literal ja sao unicas; o guard
// abaixo apanha colisao acidental caso alguem edite o mapa por engano).
const TOKEN_TO_CODE = new Map();
for (const [tok, code] of Object.entries(MAPA_TOKEN_NCM)) {
  if (TOKEN_TO_CODE.has(tok)) {
    throw new Error(`COLISAO no MAPA_TOKEN_NCM: token "${tok}" repetido. Abortado.`);
  }
  TOKEN_TO_CODE.set(tok, code);
}

// deriva o ncm_id de um nome. Recebe codeToId (codigo NCM -> id resolvido do DB).
// retorna { ncm_id, resultado, matched }
//   resultado: 'match' | 'conflito' | 'sem_token'
//   matched: [{ token, code, id }] (tokens que casaram, ja apos as regras)
function derive(nome, codeToId) {
  let tokens = tokenize(nome);

  // REGRA 3: token 'pet' e IGNORADO (removido antes de avaliar).
  tokens = tokens.filter((t) => t !== 'pet');

  // tokens que casam no mapa
  let matchedTokens = tokens.filter((t) => TOKEN_TO_CODE.has(t));

  // REGRA 2: precedencia barbear > barba. Se ha 'barbear', o token 'barba'
  // e descartado (nao conta como conflito). barbear+barba juntos => barbear vence.
  if (matchedTokens.includes('barbear')) {
    matchedTokens = matchedTokens.filter((t) => t !== 'barba');
  }

  // resolve cada token casado pro seu id, coletando o conjunto distinto
  const matched = matchedTokens.map((t) => {
    const code = TOKEN_TO_CODE.get(t);
    return { token: t, code, id: codeToId.get(code) };
  });

  // REGRA DE PAR: itera a LISTA. Cada regra so casa se um de SEUS gatilhos E o SEU
  // qualificador estao nos tokens. Sem casamento cruzado entre regras. O id entra
  // no MESMO conjunto (integra com a logica de conflito). Gatilho/qualificador
  // sozinho => nada (NULL).
  const tokenSet = new Set(tokens); // tokens ja sem 'pet'
  for (const { gatilhos, qualificador, code } of MAPA_PAR) {
    const gatilho = gatilhos.find((g) => tokenSet.has(g));
    if (gatilho && tokenSet.has(qualificador)) {
      matched.push({ token: `${gatilho}+${qualificador}`, code, id: codeToId.get(code) });
    }
  }

  const distinctIds = new Set(matched.map((m) => m.id));

  // REGRA 5: 1 => grava; 0 => null; 2+ => conflito null (CONSERVADOR)
  if (distinctIds.size === 1) {
    return { ncm_id: matched[0].id, resultado: 'match', matched };
  }
  if (distinctIds.size === 0) {
    return { ncm_id: null, resultado: 'sem_token', matched };
  }
  return { ncm_id: null, resultado: 'conflito', matched };
}

// ============================================================================
// EXECUCAO
// ============================================================================

const COMMIT = process.argv.includes('--commit') || process.argv.includes('--apply');

(async () => {
  const prisma = new PrismaClient();
  try {
    // SANIDADE da normalize (prova visual de que o range de diacriticos esta ok)
    const provaNorm = normalize('COLÔNIA Pós-Barba XAMPU');
    console.log('=== SANIDADE normalize/tokenize ===');
    console.log(`  "COLÔNIA Pós-Barba XAMPU" -> tokens: {${tokenize('COLÔNIA Pós-Barba XAMPU').join(', ')}}`);
    console.log(`  (esperado: colonia, pos, barba, xampu)\n`);

    // ---- LOOKUP: resolve cada codigo do mapa pro id na tabela ncm -----------
    // Erro de design (codigo inexistente) => ABORTA sem gravar nada.
    // Inclui os codigos da REGRA DE PAR (sabonete liquido/barra).
    const codigosUsados = [...new Set([
      ...Object.values(MAPA_TOKEN_NCM),
      ...MAPA_PAR.map((r) => r.code),
    ])];
    const ncmRows = await prisma.ncm.findMany({
      where: { ncm: { in: codigosUsados } },
      select: { id: true, ncm: true },
    });
    const codeToId = new Map(ncmRows.map((r) => [r.ncm, r.id]));

    const faltando = codigosUsados.filter((c) => !codeToId.has(c));
    if (faltando.length) {
      throw new Error(
        `MAPA_TOKEN_NCM referencia NCM(s) ausente(s) na tabela ncm: ${faltando.join(', ')}. ` +
        `Rode o seed (npm run backfill:matriz -- --commit) ou corrija o mapa. Abortado.`,
      );
    }
    console.log('=== LOOKUP NCM (codigo -> id) OK ===');
    for (const [tok, code] of Object.entries(MAPA_TOKEN_NCM)) {
      console.log(`  ${tok.padEnd(16)} ${code.padEnd(18)} -> id=${codeToId.get(code)}`);
    }
    console.log('  --- regras de par (gatilho + qualificador) ---');
    for (const { gatilhos, qualificador, code } of MAPA_PAR) {
      const label = `${gatilhos[0]}+${qualificador}`;
      console.log(`  ${label.padEnd(16)} ${code.padEnd(18)} -> id=${codeToId.get(code)}`);
    }

    // ---- candidatas: SO ncm_id NULL (idempotente; NAO toca associacao feita)
    // Sem filtro de status: a associacao fiscal vale para qualquer formula com
    // ncm_id ausente (rascunho|validada|arquivada). Idempotencia vem do NULL.
    const totalFormulas = await prisma.formula.count();
    const rows = await prisma.formula.findMany({
      where: { ncm_id: null },
      select: { id: true, nome_produto: true },
      orderBy: { id: 'asc' },
    });

    // ---- deriva ------------------------------------------------------------
    const plano = [];     // {id, nome, ncm_id, matched}  (resultado=match)
    const conflitos = []; // {id, nome, matched}          (2+ NCMs distintos)
    const semToken = [];  // {id, nome}                    (nenhum token casou)
    for (const r of rows) {
      const d = derive(r.nome_produto, codeToId);
      if (d.resultado === 'match') {
        plano.push({ id: r.id, nome: r.nome_produto, ncm_id: d.ncm_id, matched: d.matched });
      } else if (d.resultado === 'conflito') {
        conflitos.push({ id: r.id, nome: r.nome_produto, matched: d.matched });
      } else {
        semToken.push({ id: r.id, nome: r.nome_produto });
      }
    }

    // ---- PROJETADO por NCM -------------------------------------------------
    // idToCode/idToTok para rotular as contagens de forma legivel
    const idToCode = new Map(ncmRows.map((r) => [r.id, r.ncm]));
    const porId = {};
    for (const p of plano) porId[p.ncm_id] = (porId[p.ncm_id] || 0) + 1;

    console.log('\n=== UNIVERSO ===');
    console.log(`  formulas no total: ${totalFormulas}`);
    console.log(`  candidatas (ncm_id NULL): ${rows.length}`);
    console.log(`  ja associadas (ncm_id preenchido, NAO tocadas): ${totalFormulas - rows.length}`);

    console.log('\n=== PROJETADO (ncm_id que seria gravado, por NCM) ===');
    const idsOrdenados = Object.keys(porId).map(Number).sort((a, b) => porId[b] - porId[a]);
    for (const id of idsOrdenados) {
      console.log(`  id=${id} (${idToCode.get(id)}): ${porId[id]}`);
    }
    console.log(`  --- grava ${plano.length} de ${rows.length} candidatas`);
    console.log(`  --- conflito (2+ NCMs) -> NULL: ${conflitos.length}`);
    console.log(`  --- sem token conhecido -> NULL: ${semToken.length}`);

    // ---- AMOSTRA (ate 3 por NCM) — auditar o "porque" linha a linha --------
    console.log('\n=== AMOSTRA (ate 3 por NCM) ===');
    for (const id of idsOrdenados) {
      const exemplos = plano.filter((p) => p.ncm_id === id).slice(0, 3);
      for (const e of exemplos) {
        const casados = e.matched.map((m) => m.token).join(', ');
        console.log(`  [id=${id} ${idToCode.get(id)}] formula=${e.id} "${e.nome}" <- {${casados}}`);
      }
    }

    // ---- CONFLITOS — lista COMPLETA (decide se ajusta o mapa antes do commit)
    console.log(`\n=== CONFLITOS (lista completa: ${conflitos.length}) ===`);
    for (const c of conflitos) {
      const det = c.matched.map((m) => `${m.token}->id${m.id}`).join(', ');
      console.log(`  formula=${c.id} "${c.nome}" -> {${det}}`);
    }

    if (!COMMIT) {
      console.log('\n>>> DRY-RUN: nada foi gravado. Para aplicar: npm run backfill:ncm -- --commit');
      return;
    }

    if (plano.length === 0) {
      console.log('\n>>> Nada a gravar (nenhuma candidata derivou um NCM unico). No-op.');
      return;
    }

    // ========================================================================
    // COMMIT
    // ========================================================================

    // 1) GRAVA O ROLLBACK PRIMEIRO. Os ids vem de `plano` (calculado ANTES do
    //    UPDATE) — independem do resultado da transacao. writeFileSync falhar =>
    //    abortamos sem ter tocado o banco.
    const idsTocados = plano.map((p) => p.id).sort((a, b) => a - b);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rollbackSql =
      `-- Rollback do backfill de ncm_id em formulas (F3.5) — ${idsTocados.length} ids — ${ts}\n` +
      `-- MANTEM as linhas de matriz_custo_historico (verdade historica permanente).\n` +
      `UPDATE formulas SET ncm_id = NULL WHERE id IN (${idsTocados.join(', ')});\n`;
    const rollbackPath = path.join(__dirname, `matriz-custo-f35-rollback-${ts}.sql`);
    fs.writeFileSync(rollbackPath, rollbackSql, 'utf8');
    console.log(`\n>>> Rollback gravado ANTES do UPDATE em: ${rollbackPath}`);

    // 2) Monta as linhas de log (antes=null -> depois=id). user_id=NULL (script).
    const logRows = plano.map((p) => ({
      user_id: null,
      bloco: 'ncm',
      entidade: 'formula',
      entidade_id: String(p.id),
      campo: 'ncm_id',
      valor_antes: null,
      valor_depois: String(p.ncm_id),
    }));

    // 3) Aplica TUDO em UMA transacao. Agrupa por ncm_id-alvo -> 1 updateMany por
    //    grupo, com guard idempotente (so onde ncm_id continua NULL).
    const idsPorNcm = {};
    for (const p of plano) (idsPorNcm[p.ncm_id] = idsPorNcm[p.ncm_id] || []).push(p.id);

    const ops = Object.entries(idsPorNcm).map(([ncmId, ids]) =>
      prisma.formula.updateMany({
        where: { id: { in: ids }, ncm_id: null }, // guard idempotente
        data: { ncm_id: Number(ncmId) },          // ncm_revisado NAO e tocado (fica false)
      }),
    );
    ops.push(prisma.matrizCustoHistorico.createMany({ data: logRows }));

    const resultados = await prisma.$transaction(ops);
    // o ultimo resultado e o createMany do log; os anteriores sao os updateMany
    const totalGravado = resultados.slice(0, -1).reduce((s, r) => s + r.count, 0);

    console.log(`\n>>> COMMIT: ${totalGravado} formula(s) com ncm_id gravado (ncm_revisado mantido false).`);
    console.log(`>>> matriz_custo_historico: ${logRows.length} linha(s) de log.`);
    console.log('>>> SQL de reversao:\n' + rollbackSql);

    // ---- DEPOIS — confirma distribuicao final ------------------------------
    const aindaNull = await prisma.formula.count({ where: { ncm_id: null } });
    console.log('=== DEPOIS ===');
    console.log(`  formulas com ncm_id NULL: ${aindaNull} (eram ${rows.length})`);
    console.log(`  formulas com ncm_revisado=true: ` +
      `${await prisma.formula.count({ where: { ncm_revisado: true } })} (esperado: 0 — backfill nao revisa)`);
  } catch (e) {
    console.error('ERRO:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
