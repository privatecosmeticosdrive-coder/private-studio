/**
 * Somente leitura: perfil das formulas na fila "Revisao NCM" (ncm_revisado=false com ncm_id).
 * Mostra o que e ruido (arquivadas, versoes superadas, nomes repetidos, nunca orcadas)
 * e o que realmente precisa de revisao humana.
 *   node prisma/perfil-ncm-pendentes.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const q = (s) => prisma.$queryRawUnsafe(s);
const PEND = `f.ncm_revisado = false and f.ncm_id is not null`;

(async () => {
  const blocos = {
    'Fila antes x depois do filtro de 24/10 (sem arquivadas e versoes superadas)': `select count(*)::int antes,
       count(*) filter (where f.status <> 'arquivada' and not exists (select 1 from formulas g where g.derivada_de_id = f.id and g.status <> 'arquivada'))::int depois
       from formulas f where ${PEND}`,
    'Pendentes por status e origem': `select f.status, f.origem, count(*)::int n from formulas f where ${PEND} group by 1,2 order by 3 desc`,
    'Pendentes com versao mais nova (superadas)': `select count(*)::int n from formulas f where ${PEND} and exists (select 1 from formulas g where g.derivada_de_id = f.id)`,
    'Pendentes ja usadas em orcamento': `select count(distinct f.id)::int n from formulas f join orcamentos o on o.formula_id = f.id where ${PEND}`,
    'Nomes repetidos entre pendentes': `select count(*)::int grupos, coalesce(sum(c),0)::int formulas from (select lower(trim(nome_produto)) k, count(*) c from formulas f where ${PEND} group by 1 having count(*) > 1) x`,
    'NCM sugerido x quantidade': `select n.ncm, n.descricao, n.ipi_pct, n.ativo, count(*)::int n from formulas f join ncm n on n.id = f.ncm_id where ${PEND} group by 1,2,3,4 order by 5 desc`,
    'Categorias das pendentes': `select coalesce(f.categoria,'(vazia)') categoria, count(*)::int n from formulas f where ${PEND} group by 1 order by 2 desc limit 25`,
    'Sem NCM nenhum (fora da fila)': `select f.status, count(*)::int n from formulas f where f.ncm_id is null group by 1`,
    'Ja revisadas': `select count(*)::int n from formulas f where f.ncm_revisado = true`,
  };
  for (const [titulo, sql] of Object.entries(blocos)) {
    console.log(`\n== ${titulo}`);
    console.table(await q(sql));
  }
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
