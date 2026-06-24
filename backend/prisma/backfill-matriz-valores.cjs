/* eslint-disable */
// ============================================================================
// BACKFILL DE VALORES DA MATRIZ DE CUSTO (Fase 2).
//
// Popula system_config (id=1) com os parametros fiscais/operacionais e faz a
// SEED da tabela ncm (31 linhas). Determinístico, idempotente, reversivel.
//
// O QUE FAZ:
//   A) system_config id=1: mo_dias_uteis=22 (DEFINITIVO); icms_regime=12,
//      pis_cofins_monofasico_pct=12.5, pis_cofins_servico_pct=9.25 (PROVISORIOS).
//      fiscais_provisorios fica true (default — NAO mexe). Os 4 operacionais
//      (custo_fixo_mensal/horas_dia/eficiencia_linha/margem_padrao_pct) sao
//      SO conferidos (sanity); divergencia => REPORTA E ABORTA, nao "conserta".
//   B) ncm: seed de 31 linhas, INSERT-ONLY (insere ausente, pula existente via
//      @unique). Todas provisorio=true. monofasico EXPLICITO por linha.
//
// IDEMPOTENTE POR DIFF: le o estado atual e so age/loga no que difere do alvo.
//   Re-run = no-op (system_config ja no alvo => nada; ncm ja presente => pula).
//
// LOG: cada campo fiscal alterado e cada NCM inserida gera linha em
//   matriz_custo_historico (antes->depois). user_id=NULL (e script, sem JWT).
//   O estado "provisorio" vive nas flags (fiscais_provisorios / ncm.provisorio),
//   nao no texto do log.
//
// NAO TOCA: custo-engine.ts, calculo.service.ts, nem a tabela formulas.
//
// USO:
//   npm run backfill:matriz             -> DRY-RUN (nao grava; imprime o plano)
//   npm run backfill:matriz -- --commit -> aplica em transacao, grava rollback
//                                          ANTES de aplicar e imprime o SQL.
//
// REVERSIVEL: em --commit grava prisma/matriz-custo-f2-rollback-<timestamp>.sql
//   com: UPDATE restaurando os campos alterados de system_config + DELETE das
//   NCMs inseridas. MANTEM as linhas de log (verdade historica permanente).
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
// DADOS VERSIONADOS — alvo fiscal/operacional e seed NCM. Unico ponto de
// verdade. (auditoria/reversao: mexe so neste bloco.)
// ============================================================================

// Parte A — alvos de system_config (id=1).
// fiscais (provisorios) + mo_dias_uteis (definitivo). NAO inclui fiscais_provisorios
// (fica true por default) nem os operacionais (so sanity, abaixo).
const ALVO_FISCAL = {
  mo_dias_uteis: 22,               // DEFINITIVO (bloco operacional; sem marca provisorio)
  icms_regime: 12,                 // PROVISORIO
  pis_cofins_monofasico_pct: 12.5, // PROVISORIO
  pis_cofins_servico_pct: 9.25,    // PROVISORIO
};
// bloco do log por campo (mo_dias_uteis = operacional; os demais = fiscal)
const BLOCO_CAMPO = {
  mo_dias_uteis: 'operacional',
  icms_regime: 'fiscal',
  pis_cofins_monofasico_pct: 'fiscal',
  pis_cofins_servico_pct: 'fiscal',
};

// Operacionais — SO sanity (entraram com default certo na F1). Divergencia aborta.
const SANITY_OPERACIONAL = {
  custo_fixo_mensal: 120240,
  horas_dia: 8,
  eficiencia_linha: 0.75,
  margem_padrao_pct: 30,
};

// Parte B — seed NCM (31 linhas). monofasico EXPLICITO por linha (nao inferido).
// As 5 NAO-monofasicas (false): 3401.11.10, 3401.11.90-Ex01, 3401.19.00,
// 3401.20.90, 3401.30.00. As demais true. Ex como linhas proprias (ncm @unique
// usa o codigo completo, com sufixo -ExNN). Todas provisorio=true.
const SEED_NCM = [
  { ncm: '3303.00.10',      descricao: 'Perfumes',                ipi_pct: 27.3, monofasico: true },
  { ncm: '3303.00.20',      descricao: 'Aguas-de-colonia',        ipi_pct: 7.8,  monofasico: true },
  { ncm: '3304.10.00',      descricao: 'Maquiagem labios',        ipi_pct: 14.3, monofasico: true },
  { ncm: '3304.20.10',      descricao: 'Maquiagem olhos',         ipi_pct: 14.3, monofasico: true },
  { ncm: '3304.20.90',      descricao: 'Maquiagem olhos outros',  ipi_pct: 14.3, monofasico: true },
  { ncm: '3304.30.00',      descricao: 'Unhas/esmaltes',          ipi_pct: 14.3, monofasico: true },
  { ncm: '3304.91.00',      descricao: 'Pos/compactos',           ipi_pct: 14.3, monofasico: true },
  { ncm: '3304.91.00-Ex01', descricao: 'Talco',                   ipi_pct: 7.8,  monofasico: true },
  { ncm: '3304.99.10',      descricao: 'Cremes/locoes',           ipi_pct: 14.3, monofasico: true },
  { ncm: '3304.99.90',      descricao: 'Outros pele',             ipi_pct: 14.3, monofasico: true },
  { ncm: '3304.99.90-Ex01', descricao: 'Bronzeador',              ipi_pct: 7.8,  monofasico: true },
  { ncm: '3304.99.90-Ex02', descricao: 'Antissolar',             ipi_pct: 0,    monofasico: true },
  { ncm: '3305.10.00',      descricao: 'Xampu',                   ipi_pct: 4.55, monofasico: true },
  { ncm: '3305.20.00',      descricao: 'Alisamento',              ipi_pct: 14.3, monofasico: true },
  { ncm: '3305.30.00',      descricao: 'Laques',                  ipi_pct: 14.3, monofasico: true },
  { ncm: '3305.90.00',      descricao: 'Outras capilares',        ipi_pct: 14.3, monofasico: true },
  { ncm: '3305.90.00-Ex01', descricao: 'Condicionador',           ipi_pct: 4.55, monofasico: true },
  { ncm: '3307.10.00',      descricao: 'Barbear',                 ipi_pct: 14.3, monofasico: true },
  { ncm: '3307.20.10',      descricao: 'Desodorante liquido',     ipi_pct: 4.55, monofasico: true },
  { ncm: '3307.20.90',      descricao: 'Desodorante outros',      ipi_pct: 4.55, monofasico: true },
  { ncm: '3307.30.00',      descricao: 'Sais banho',              ipi_pct: 14.3, monofasico: true },
  { ncm: '3307.41.00',      descricao: 'Ambiente combustao',      ipi_pct: 14.3, monofasico: true },
  { ncm: '3307.49.00',      descricao: 'Ambiente outros',         ipi_pct: 22,   monofasico: true },
  { ncm: '3307.90.00',      descricao: 'Outros/intimo',           ipi_pct: 14.3, monofasico: true },
  { ncm: '3401.11.10',      descricao: 'Saboes medicinais',       ipi_pct: 3.25, monofasico: false }, // NAO-mono
  { ncm: '3401.11.90',      descricao: 'Sabonete barra',          ipi_pct: 3.25, monofasico: true },
  { ncm: '3401.11.90-Ex01', descricao: 'Sabao',                   ipi_pct: 0,    monofasico: false }, // NAO-mono
  { ncm: '3401.19.00',      descricao: 'Saboes/tensoativos',      ipi_pct: 3.25, monofasico: false }, // NAO-mono
  { ncm: '3401.20.10',      descricao: 'Sabao toucador',          ipi_pct: 3.25, monofasico: true },
  { ncm: '3401.20.90',      descricao: 'Sabao outros',            ipi_pct: 3.25, monofasico: false }, // NAO-mono
  { ncm: '3401.30.00',      descricao: 'Sabonete liquido',        ipi_pct: 6.5,  monofasico: false }, // NAO-mono
];

// ============================================================================
// HELPERS
// ============================================================================

// Decimal do Prisma -> number (ou null). Int/number passam direto.
function toNum(v) {
  if (v === null || v === undefined) return null;
  return Number(v.toString());
}
// literal SQL: null -> NULL; numero -> o proprio; string -> 'escapada'
function sqlLit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

// ============================================================================
// EXECUCAO
// ============================================================================

const COMMIT = process.argv.includes('--commit') || process.argv.includes('--apply');

(async () => {
  const prisma = new PrismaClient();
  try {
    // ---- VALIDACAO INTERNA da seed (antes de tocar o banco) -----------------
    if (SEED_NCM.length !== 31) {
      throw new Error(`SEED_NCM deveria ter 31 linhas, tem ${SEED_NCM.length}. Abortado.`);
    }
    const vistos = new Set();
    for (const r of SEED_NCM) {
      if (vistos.has(r.ncm)) throw new Error(`NCM duplicada na seed: "${r.ncm}". Abortado.`);
      vistos.add(r.ncm);
      if (typeof r.ipi_pct !== 'number' || Number.isNaN(r.ipi_pct)) {
        throw new Error(`ipi_pct nao numerico em "${r.ncm}". Abortado.`);
      }
      if (typeof r.monofasico !== 'boolean') {
        throw new Error(`monofasico nao booleano em "${r.ncm}". Abortado.`);
      }
    }
    const naoMono = SEED_NCM.filter((r) => r.monofasico === false).map((r) => r.ncm);
    console.log(`=== VALIDACAO SEED: 31 linhas, sem duplicata, ipi numerico, monofasico booleano OK ===`);
    console.log(`  NAO-monofasicas (${naoMono.length}): ${naoMono.join(', ')}`);

    // ---- PRE-CONDICOES: colunas/tabelas da F1 e F2-prep existem? ------------
    const estrut = await prisma.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_name='system_config' AND column_name IN
           ('icms_regime','pis_cofins_monofasico_pct','pis_cofins_servico_pct','fiscais_provisorios'))::int AS cfg_cols,
        (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_name='ncm' AND column_name IN ('provisorio','ipi_pct','monofasico'))::int AS ncm_cols,
        (SELECT COUNT(*) FROM information_schema.tables
           WHERE table_schema='public' AND table_name IN ('ncm','matriz_custo_historico'))::int AS tbls;`);
    const e = estrut[0];
    if (e.cfg_cols < 4 || e.ncm_cols < 3 || e.tbls < 2) {
      throw new Error(
        `Pre-condicao falhou: F1/F2-prep nao aplicadas (cfg_cols=${e.cfg_cols}/4, ` +
        `ncm_cols=${e.ncm_cols}/3, tbls=${e.tbls}/2). Rode "npm run migrate:deploy" primeiro. Abortado.`,
      );
    }
    console.log('=== PRE-CONDICOES: colunas/tabelas F1+F2-prep presentes OK ===\n');

    // ---- ESTADO ATUAL de system_config -------------------------------------
    const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 } });
    if (!cfg) throw new Error('system_config id=1 nao existe. Abortado.');

    // SANITY operacional — diverge? reporta TODOS e aborta (nao conserta).
    const divergencias = [];
    for (const [campo, esperado] of Object.entries(SANITY_OPERACIONAL)) {
      const atual = toNum(cfg[campo]);
      if (atual !== esperado) divergencias.push({ campo, atual, esperado });
    }
    if (divergencias.length) {
      console.error('=== SANITY OPERACIONAL FALHOU (abortando, nada gravado) ===');
      for (const d of divergencias) {
        console.error(`  ${d.campo}: atual=${d.atual} esperado=${d.esperado}`);
      }
      throw new Error('Operacionais divergem do esperado. Verifique a F1. Abortado.');
    }
    console.log('=== SANITY OPERACIONAL OK (120240 / 8 / 0.75 / 30) ===');

    // ---- DIFF Parte A: quais campos fiscais/operacionais mudam --------------
    const mudancasCfg = []; // {campo, antes, depois, bloco}
    for (const [campo, depois] of Object.entries(ALVO_FISCAL)) {
      const antes = toNum(cfg[campo]);
      if (antes !== depois) {
        mudancasCfg.push({ campo, antes, depois, bloco: BLOCO_CAMPO[campo] });
      }
    }

    console.log('\n=== PARTE A — system_config id=1 (diff) ===');
    if (mudancasCfg.length === 0) {
      console.log('  (nada a alterar — ja no alvo)');
    } else {
      for (const m of mudancasCfg) {
        const tag = m.bloco === 'fiscal' ? ' [PROVISORIO]' : ' [definitivo]';
        console.log(`  ${m.campo}: ${m.antes === null ? 'NULL' : m.antes} -> ${m.depois}${tag}`);
      }
    }
    console.log('  fiscais_provisorios: ' + cfg.fiscais_provisorios + ' (mantido — nao mexe)');

    // ---- DIFF Parte B: quais NCMs inserir (insert-only) ---------------------
    const existentes = await prisma.ncm.findMany({ select: { ncm: true } });
    const setExist = new Set(existentes.map((r) => r.ncm));
    const aInserir = SEED_NCM.filter((r) => !setExist.has(r.ncm));
    const aPular = SEED_NCM.filter((r) => setExist.has(r.ncm));

    console.log('\n=== PARTE B — seed ncm (insert-only) ===');
    console.log(`  a inserir: ${aInserir.length} | ja existentes (puladas): ${aPular.length} | tabela hoje: ${existentes.length}`);
    if (aInserir.length) {
      console.log('  --- linhas a inserir (todas provisorio=true) ---');
      for (const r of aInserir) {
        console.log(`    ${r.ncm}  ipi=${r.ipi_pct}  mono=${r.monofasico}  "${r.descricao}"`);
      }
    }
    if (aPular.length) {
      console.log('  --- puladas (ja existem; respeita edicao humana posterior) ---');
      for (const r of aPular) console.log(`    ${r.ncm}`);
    }

    // ---- nada a fazer? -------------------------------------------------------
    if (mudancasCfg.length === 0 && aInserir.length === 0) {
      console.log('\n>>> Nada a fazer (system_config no alvo e NCMs ja presentes). No-op.');
      if (!COMMIT) console.log('>>> (dry-run)');
      return;
    }

    if (!COMMIT) {
      console.log('\n>>> DRY-RUN: nada foi gravado. Para aplicar: npm run backfill:matriz -- --commit');
      return;
    }

    // ========================================================================
    // COMMIT
    // ========================================================================

    // 1) GRAVA O ROLLBACK PRIMEIRO (conteudo vem do diff, calculado ANTES do
    //    write). Se o writeFileSync falhar, abortamos sem ter tocado o banco.
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    let rollbackSql = `-- Rollback do backfill da Matriz (F2) — ${ts}\n`;
    rollbackSql += `-- MANTEM as linhas de matriz_custo_historico (verdade historica permanente).\n`;
    rollbackSql += `BEGIN;\n`;
    if (mudancasCfg.length) {
      const sets = mudancasCfg.map((m) => `"${m.campo}" = ${sqlLit(m.antes)}`).join(', ');
      rollbackSql += `-- restaura system_config (so os campos alterados)\n`;
      rollbackSql += `UPDATE "system_config" SET ${sets} WHERE "id" = 1;\n`;
    }
    if (aInserir.length) {
      const lista = aInserir.map((r) => `'${r.ncm}'`).join(', ');
      rollbackSql += `-- remove as NCMs inseridas por esta execucao\n`;
      rollbackSql += `-- AVISO: se a F3.5 ja tiver associado formulas a estas NCMs, o FK\n`;
      rollbackSql += `--        (ON DELETE SET NULL) zera formulas.ncm_id dessas linhas.\n`;
      rollbackSql += `DELETE FROM "ncm" WHERE "ncm" IN (${lista});\n`;
    }
    rollbackSql += `COMMIT;\n`;
    const rollbackPath = path.join(__dirname, `matriz-custo-f2-rollback-${ts}.sql`);
    fs.writeFileSync(rollbackPath, rollbackSql, 'utf8');
    console.log(`\n>>> Rollback gravado ANTES de aplicar em: ${rollbackPath}`);

    // 2) Monta as linhas de log (antes->depois). user_id=NULL (script).
    const logRows = [];
    for (const m of mudancasCfg) {
      logRows.push({
        user_id: null,
        bloco: m.bloco,
        entidade: 'system_config',
        entidade_id: '1',
        campo: m.campo,
        valor_antes: m.antes === null ? null : String(m.antes),
        valor_depois: String(m.depois),
      });
    }
    for (const r of aInserir) {
      logRows.push({
        user_id: null,
        bloco: 'ncm',
        entidade: 'ncm',
        entidade_id: r.ncm, // chave de negocio (estavel; createMany nao retorna id)
        campo: 'insert',
        valor_antes: null,
        valor_depois: `ipi_pct=${r.ipi_pct}; monofasico=${r.monofasico}; provisorio=true; "${r.descricao}"`,
      });
    }

    // 3) Aplica TUDO em UMA transacao.
    const ops = [];
    if (mudancasCfg.length) {
      const data = {};
      for (const m of mudancasCfg) data[m.campo] = m.depois;
      ops.push(prisma.systemConfig.update({ where: { id: 1 }, data }));
    }
    if (aInserir.length) {
      ops.push(
        prisma.ncm.createMany({
          data: aInserir.map((r) => ({
            ncm: r.ncm,
            descricao: r.descricao,
            ipi_pct: r.ipi_pct,
            monofasico: r.monofasico,
            provisorio: true,
          })),
          skipDuplicates: true, // dupla garantia de insert-only
        }),
      );
    }
    if (logRows.length) {
      ops.push(prisma.matrizCustoHistorico.createMany({ data: logRows }));
    }
    const resultados = await prisma.$transaction(ops);

    console.log('\n>>> COMMIT aplicado:');
    console.log(`    system_config: ${mudancasCfg.length} campo(s) alterado(s)`);
    console.log(`    ncm: ${aInserir.length} linha(s) inserida(s) (insert-only)`);
    console.log(`    matriz_custo_historico: ${logRows.length} linha(s) de log`);
    console.log('\n>>> SQL de reversao:\n' + rollbackSql);

    // ---- DEPOIS — confirma estado final ------------------------------------
    const cfg2 = await prisma.systemConfig.findUnique({ where: { id: 1 } });
    const nCount = await prisma.ncm.count();
    console.log('=== DEPOIS ===');
    console.log(`  mo_dias_uteis=${cfg2.mo_dias_uteis} icms_regime=${toNum(cfg2.icms_regime)} ` +
      `pis_mono=${toNum(cfg2.pis_cofins_monofasico_pct)} pis_serv=${toNum(cfg2.pis_cofins_servico_pct)} ` +
      `fiscais_provisorios=${cfg2.fiscais_provisorios}`);
    console.log(`  ncm: ${nCount} linha(s)`);
  } catch (e) {
    console.error('ERRO:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
