/**
 * Desfaz a limpeza de limpar-testes-studio.cjs a partir do JSON salvo em prisma/arquivo-testes/.
 *   node prisma/restaurar-testes-studio.cjs prisma/arquivo-testes/testes-studio-<data>.json            # plano
 *   node prisma/restaurar-testes-studio.cjs prisma/arquivo-testes/testes-studio-<data>.json --commit   # reinsere
 * Reinsere cada linha com TODAS as colunas originais (jsonb_populate_record), na ordem das chaves
 * estrangeiras, ignorando o que ja existir (on conflict do nothing), e devolve os valores "antes"
 * das linhas que foram so alteradas (formulas arquivadas, usuarios inativados, refs zeradas).
 */
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');
const arquivo = process.argv.slice(2).find((a) => !a.startsWith('--'));

const ORDEM = ['users', 'clientes', 'formulas', 'formula_composicao', 'orcamentos', 'propostas', 'proposta_itens',
  'pendencias_lab', 'amostra_eventos', 'formula_matches', 'integration_events', 'alertas', 'audit_log'];

/** Pais antes dos filhos numa auto-referencia (formulas: mae/derivada; orcamentos: versao_de_id). */
function ordenarAutoRef(rows, cols) {
  const ids = new Set(rows.map((r) => r.id));
  const feitos = new Set();
  const saida = [];
  let resto = [...rows];
  while (resto.length) {
    const prontos = resto.filter((r) => cols.every((c) => r[c] == null || !ids.has(r[c]) || feitos.has(r[c])));
    if (!prontos.length) throw new Error('ciclo de auto-referencia no arquivo');
    for (const r of prontos) { saida.push(r); feitos.add(r.id); }
    resto = resto.filter((r) => !feitos.has(r.id));
  }
  return saida;
}

(async () => {
  if (!arquivo || !fs.existsSync(arquivo)) throw new Error('Informe o JSON de prisma/arquivo-testes/.');
  const dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const tabelas = Object.keys(dados.linhas).filter((t) => dados.linhas[t].length);
  const fora = tabelas.filter((t) => !ORDEM.includes(t));
  if (fora.length) throw new Error(`Tabelas sem ordem definida: ${fora.join(', ')}`);
  console.log(`Arquivo de ${dados.gerado_em}:`);
  for (const t of ORDEM) if (dados.linhas[t]?.length) console.log(`  ${t}: ${dados.linhas[t].length} linha(s) a reinserir`);
  console.log(`  alteracoes a desfazer: ${dados.alteracoes.length}`);
  if (!COMMIT) { console.log('\nPLANO — nada gravado. Use --commit.'); await prisma.$disconnect(); return; }

  const n = await prisma.$transaction(async (tx) => {
    const n = {};
    for (const t of ORDEM) {
      let rows = dados.linhas[t] ?? [];
      if (!rows.length) continue;
      if (t === 'formulas') rows = ordenarAutoRef(rows, ['formula_mae_id', 'derivada_de_id']);
      if (t === 'orcamentos') rows = ordenarAutoRef(rows, ['versao_de_id']);
      n[t] = 0;
      for (const r of rows) n[t] += await tx.$executeRawUnsafe(`insert into "${t}" select * from jsonb_populate_record(null::"${t}", $1::jsonb) on conflict do nothing`, JSON.stringify(r));
    }
    n.alteracoes = 0;
    for (const a of dados.alteracoes) {
      const cols = Object.keys(a.antes);
      const set = cols.map((c, i) => `"${c}" = (jsonb_populate_record(null::"${a.tabela}", $${i + 2}::jsonb))."${c}"`).join(', ');
      n.alteracoes += await tx.$executeRawUnsafe(`update "${a.tabela}" set ${set} where "${a.chave}"::text = $1`, String(a.id), ...cols.map((c) => JSON.stringify({ [c]: a.antes[c] })));
    }
    return n;
  }, { timeout: 300000, maxWait: 30000 });
  console.log('\nRESTAURADO:', n);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
