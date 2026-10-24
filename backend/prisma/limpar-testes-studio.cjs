/**
 * Limpa do Studio os dados de TESTE, guardando antes cada linha afetada (todas as colunas)
 * em prisma/arquivo-testes/testes-studio-<data>.json. Desfazer: restaurar-testes-studio.cjs.
 *   node prisma/limpar-testes-studio.cjs                     # plano (so le)
 *   node prisma/limpar-testes-studio.cjs --commit            # exporta e limpa (transacao)
 *   node prisma/limpar-testes-studio.cjs --incluir-duvidas   # inclui os clientes "provavel teste"
 *
 * CRITERIO (24/10/2026, pedido do dono "limpe o studio dos testes realizados"):
 *  - Cliente de teste: nome com a palavra "teste" (ex.: "Teste Agente", "Fernando Teste") ou
 *    da lista CLIENTES_TESTE. Duvidas (CLIENTES_DUVIDA) so com --incluir-duvidas.
 *  - Orcamento de teste: todo orcamento de cliente de teste. Saem junto: amostra_eventos,
 *    formula_matches, integration_events e audit_log desses orcamentos.
 *  - Pendencia de laboratorio de teste: aberta a partir de orcamento de teste.
 *      formulacao_nova -> a formula criada (e as versoes derivadas dela) e de teste: APAGADA.
 *      revisao         -> a versao criada mexe numa formula real: ARQUIVADA (status 'arquivada'),
 *                         nunca apagada. Idem para formula de teste ainda usada por orcamento real.
 *  - Usuario de teste: e-mail @*.localhost ou @local.test. Apagado so se nada mais aponta
 *    para ele; senao fica inativo.
 * Recalcula tudo na hora (nao depende de ids fixos). Aborta se alguma tabela nova (fora das
 * conhecidas) apontar para o que vai sair, para nunca apagar em cascata sem ver.
 */
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');
const DUVIDAS = process.argv.includes('--incluir-duvidas');

const CLIENTES_TESTE = ['Brunão Dev Monstro'];
const CLIENTES_DUVIDA = [{ nome: 'Bianca Beauty', motivo: 'e-mail mgquintino8@gmail.com parece ser do proprio dono; sem proposta no Canva' }];
const EMAIL_USUARIO_TESTE = /@([a-z0-9-]+\.)*localhost$|@local\.test$/i;
// Tabelas que este script sabe tratar quando apontam para orcamentos/formulas/clientes/users/pendencias.
const FK_CONHECIDAS = new Set([
  'formulas.cliente_id', 'orcamentos.cliente_id', 'projetos_viabilidade.cliente_id',
  'formula_composicao.formula_id', 'formulas.formula_mae_id', 'formulas.derivada_de_id', 'orcamentos.formula_id',
  'pendencias_lab.formula_base_id', 'pendencias_lab.formula_resultado_id',
  'amostra_eventos.orcamento_id', 'formula_matches.orcamento_id', 'pendencias_lab.orcamento_id',
  // migracao 20261025100000 (versoes de orcamento, FAC, propostas) — tratadas se existirem
  'orcamentos.versao_de_id', 'propostas.cliente_id', 'proposta_itens.orcamento_id', 'proposta_itens.proposta_id',
]);
const existe = async (tx, tabela, coluna) => {
  const [{ ok }] = await q(tx, coluna
    ? `select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2) ok`
    : `select to_regclass('public.' || $1) is not null ok`, ...(coluna ? [tabela, coluna] : [tabela]));
  return ok;
};

const q = (tx, sql, ...a) => tx.$queryRawUnsafe(sql, ...a);
const linhas = (tx, tabela, where, ...a) => q(tx, `select to_jsonb(t) as r from "${tabela}" t where ${where}`, ...a).then((rs) => rs.map((x) => x.r));

async function levantar(tx) {
  const clientes = await q(tx, `select id, nome, email from clientes`);
  const nomesDuvida = DUVIDAS ? CLIENTES_DUVIDA.map((c) => c.nome) : [];
  const cliTeste = clientes.filter((c) => /\bteste\b/i.test(c.nome) || CLIENTES_TESTE.includes(c.nome.trim()) || nomesDuvida.includes(c.nome.trim()));
  const cliIds = cliTeste.map((c) => c.id);

  let orcs = cliIds.length ? await q(tx, `select id, numero, produto, formula_id from orcamentos where cliente_id = any($1::uuid[])`, cliIds) : [];
  // versoes derivadas de orcamento de teste tambem sao de teste (coluna existe apos a migracao 20261025100000)
  if (await existe(tx, 'orcamentos', 'versao_de_id')) {
    for (let novo = orcs.map((o) => o.id); novo.length; ) {
      const filhos = await q(tx, `select id, numero, produto, formula_id from orcamentos where versao_de_id = any($1::uuid[]) and not (id = any($2::uuid[]))`, novo, orcs.map((o) => o.id));
      orcs = orcs.concat(filhos);
      novo = filhos.map((o) => o.id);
    }
  }
  const orcIds = orcs.map((o) => o.id);
  const temPropostas = await existe(tx, 'propostas');
  const propostas = temPropostas && (cliIds.length || orcIds.length)
    ? await q(tx, `select id from propostas where cliente_id = any($1::uuid[]) or id in (select proposta_id from proposta_itens where orcamento_id = any($2::uuid[]))`, cliIds, orcIds)
    : [];
  const propIds = propostas.map((p) => p.id);

  const pend = orcIds.length ? await q(tx, `select id, tipo, status, descricao, formula_base_id, formula_resultado_id from pendencias_lab where orcamento_id = any($1::uuid[])`, orcIds) : [];
  // formulacao_nova de teste: a formula criada e toda a descendencia (versoes derivadas)
  let apagar = pend.filter((p) => p.tipo === 'formulacao_nova' && p.formula_resultado_id).map((p) => p.formula_resultado_id);
  for (let novo = apagar; novo.length; ) {
    const filhas = await q(tx, `select id from formulas where (derivada_de_id = any($1::int[]) or formula_mae_id = any($1::int[])) and not (id = any($2::int[]))`, novo, apagar);
    novo = filhas.map((f) => f.id);
    apagar = apagar.concat(novo);
  }
  let arquivar = pend.filter((p) => p.tipo !== 'formulacao_nova' && p.formula_resultado_id).map((p) => p.formula_resultado_id).filter((id) => !apagar.includes(id));
  // formula "de teste" usada por orcamento REAL nao some: vira arquivada
  const usadasReal = apagar.length ? await q(tx, `select distinct formula_id id from orcamentos where formula_id = any($1::int[]) and not (id = any($2::uuid[]))`, apagar, orcIds) : [];
  for (const { id } of usadasReal) { apagar = apagar.filter((x) => x !== id); arquivar.push(id); }
  arquivar = [...new Set(arquivar)];
  // pendencias que tocam formulas apagadas tambem saem (ex.: melhoria proativa da versao de teste)
  const pendExtra = apagar.length ? await q(tx, `select id from pendencias_lab where (formula_base_id = any($1::int[]) or formula_resultado_id = any($1::int[])) and not (id = any($2::int[]))`, apagar, pend.map((p) => p.id)) : [];
  const pendIds = pend.map((p) => p.id).concat(pendExtra.map((p) => p.id));

  const users = await q(tx, `select id, email from users`);
  const usrTeste = users.filter((u) => EMAIL_USUARIO_TESTE.test(u.email));

  const formulasInfo = apagar.concat(arquivar).length ? await q(tx, `select id, nome_produto, versao_codigo, status from formulas where id = any($1::int[]) order by id`, apagar.concat(arquivar)) : [];
  return { cliTeste, cliIds, orcs, orcIds, pendIds, pend, apagar, arquivar, usrTeste, formulasInfo, temPropostas, propIds };
}

async function checarFksDesconhecidas(tx) {
  const fks = await q(tx, `select tc.table_name tabela, kcu.column_name coluna, ccu.table_name ref
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name in ('orcamentos','formulas','clientes','pendencias_lab','propostas')`);
  return fks.filter((f) => !FK_CONHECIDAS.has(`${f.tabela}.${f.coluna}`));
}

(async () => {
  const L = await levantar(prisma);
  const desconhecidas = await checarFksDesconhecidas(prisma);
  console.log(`Clientes de teste (${L.cliTeste.length}): ${L.cliTeste.map((c) => c.nome.trim()).join(', ') || '-'}`);
  if (!DUVIDAS) for (const d of CLIENTES_DUVIDA) console.log(`  (fica, duvida: ${d.nome} — ${d.motivo}; use --incluir-duvidas)`);
  console.log(`Orcamentos de teste (${L.orcs.length}): ${L.orcs.map((o) => `#${o.numero} ${o.produto}`).join(' | ')}`);
  console.log(`Pendencias de lab de teste (${L.pendIds.length}): ${L.pend.map((p) => `#${p.id} ${p.tipo}/${p.status} "${p.descricao.slice(0, 40)}"`).join(' | ')}${L.pendIds.length > L.pend.length ? ` + ${L.pendIds.length - L.pend.length} ligada(s) a formula apagada` : ''}`);
  for (const f of L.formulasInfo) console.log(`  formula ${f.id} ${f.nome_produto} v${f.versao_codigo} (${f.status}) -> ${L.apagar.includes(f.id) ? 'APAGAR' : 'ARQUIVAR'}`);
  console.log(`Usuarios de teste (${L.usrTeste.length}): ${L.usrTeste.map((u) => u.email).join(', ') || '-'}`);
  console.log(L.temPropostas ? `Propostas comerciais de teste: ${L.propIds.length}` : 'Tabela propostas ainda nao existe neste banco (migracao 20261025100000 nao aplicada) — ignorada.');
  if (desconhecidas.length) {
    const comLinhas = [];
    for (const f of desconhecidas) {
      const ids = f.ref === 'orcamentos' ? L.orcIds : f.ref === 'formulas' ? L.apagar : f.ref === 'clientes' ? L.cliIds : f.ref === 'propostas' ? L.propIds : L.pendIds;
      const tipo = (await q(prisma, `select data_type from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2`, f.tabela, f.coluna))[0]?.data_type;
      const cast = tipo === 'uuid' ? 'uuid[]' : tipo === 'integer' ? 'int[]' : 'text[]';
      const [{ n }] = ids.length ? await q(prisma, `select count(*)::int n from "${f.tabela}" where "${f.coluna}" = any($1::${cast})`, ids) : [{ n: 0 }];
      if (n) comLinhas.push(`${f.tabela}.${f.coluna} -> ${f.ref}: ${n} linha(s)`);
    }
    if (comLinhas.length) { console.error(`\nABORTADO: tabelas novas apontam para o que sairia — tratar no script antes:\n  ${comLinhas.join('\n  ')}`); await prisma.$disconnect(); process.exit(1); }
  }
  if (!COMMIT) { console.log('\nPLANO — nada gravado. Use --commit.'); await prisma.$disconnect(); return; }

  const admin = await prisma.user.findFirst({ where: { email: 'privatecosmeticosdrive@gmail.com' }, select: { id: true } })
    ?? await prisma.user.findFirst({ where: { role: 'admin', ativo: true }, select: { id: true } });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(__dirname, 'arquivo-testes');
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, `testes-studio-${stamp}.json`);

  const resumo = await prisma.$transaction(async (tx) => {
    const L2 = await levantar(tx); // de novo, dentro da transacao
    const orcTxt = L2.orcIds.map(String);
    const formTxt = L2.apagar.map(String);
    const exp = { linhas: {}, alteracoes: [] };
    const guardar = async (tabela, where, ...a) => { exp.linhas[tabela] = (exp.linhas[tabela] ?? []).concat(await linhas(tx, tabela, where, ...a)); };

    // 1) exporta tudo que vai sair
    await guardar('audit_log', `(entidade = 'orcamento' and entidade_id = any($1::text[])) or (entidade = 'formula' and entidade_id = any($2::text[])) or user_id = any($3::uuid[])`, orcTxt, formTxt, L2.usrTeste.map((u) => u.id));
    await guardar('integration_events', `entidade_tipo = 'orcamento' and entidade_id = any($1::text[])`, orcTxt);
    await guardar('alertas', `entidade_tipo = 'formula' and entidade_id = any($1::int[])`, L2.apagar);
    await guardar('formula_matches', `orcamento_id = any($1::uuid[])`, L2.orcIds);
    await guardar('amostra_eventos', `orcamento_id = any($1::uuid[])`, L2.orcIds);
    await guardar('pendencias_lab', `id = any($1::int[])`, L2.pendIds);
    if (L2.temPropostas) {
      await guardar('proposta_itens', `proposta_id = any($1::uuid[]) or orcamento_id = any($2::uuid[])`, L2.propIds, L2.orcIds);
      await guardar('propostas', `id = any($1::uuid[])`, L2.propIds);
    }
    await guardar('orcamentos', `id = any($1::uuid[])`, L2.orcIds);
    await guardar('formula_composicao', `formula_id = any($1::int[])`, L2.apagar);
    await guardar('formulas', `id = any($1::int[])`, L2.apagar);
    await guardar('clientes', `id = any($1::uuid[])`, L2.cliIds);

    // 2) alteracoes (guardando o "antes"): formulas arquivadas, refs de clientes que ficam
    for (const r of await linhas(tx, 'formulas', `id = any($1::int[])`, L2.arquivar)) exp.alteracoes.push({ tabela: 'formulas', chave: 'id', id: r.id, antes: { status: r.status, updated_at: r.updated_at } });
    for (const r of await linhas(tx, 'formulas', `cliente_id = any($1::uuid[]) and not (id = any($2::int[]))`, L2.cliIds, L2.apagar)) exp.alteracoes.push({ tabela: 'formulas', chave: 'id', id: r.id, antes: { cliente_id: r.cliente_id } });
    for (const r of await linhas(tx, 'projetos_viabilidade', `cliente_id = any($1::uuid[])`, L2.cliIds)) exp.alteracoes.push({ tabela: 'projetos_viabilidade', chave: 'id', id: r.id, antes: { cliente_id: r.cliente_id } });
    for (const r of await linhas(tx, 'pendencias_lab', `(formula_base_id = any($1::int[]) or formula_resultado_id = any($1::int[])) and not (id = any($2::int[]))`, L2.apagar, L2.pendIds)) exp.alteracoes.push({ tabela: 'pendencias_lab', chave: 'id', id: r.id, antes: { formula_base_id: r.formula_base_id, formula_resultado_id: r.formula_resultado_id } });

    // 3) usuarios de teste: apaga se nada (alem do que sai) aponta; senao inativa
    const usrApagar = [];
    for (const u of L2.usrTeste) {
      const [{ n }] = await q(tx, `select (
        (select count(*) from clientes where created_by = $1::uuid and not (id = any($2::uuid[]))) +
        (select count(*) from orcamentos where (created_by = $1::uuid or amostra_solicitada_por = $1::uuid or amostra_responsavel_id = $1::uuid) and not (id = any($3::uuid[]))) +
        (select count(*) from formulas where (created_by = $1::uuid or validada_por = $1::uuid) and not (id = any($4::int[]))) +
        (select count(*) from mp_historico_precos where registrado_por = $1::uuid) + (select count(*) from emb_historico_precos where registrado_por = $1::uuid) +
        (select count(*) from embalagens where created_by = $1::uuid) + (select count(*) from cotacoes_pendentes where created_by = $1::uuid or validada_por = $1::uuid) +
        (select count(*) from matriz_custo_historico where user_id = $1::uuid) + (select count(*) from amostra_eventos where registrado_por = $1::uuid and not (orcamento_id = any($3::uuid[])))
      )::int n`, u.id, L2.cliIds, L2.orcIds, L2.apagar);
      if (n === 0) usrApagar.push(u.id);
      else { const [r] = await linhas(tx, 'users', `id = $1::uuid`, u.id); exp.alteracoes.push({ tabela: 'users', chave: 'id', id: r.id, antes: { ativo: r.ativo } }); }
    }
    await guardar('users', `id = any($1::uuid[])`, usrApagar);

    // 4) apaga / altera (ordem de chaves estrangeiras)
    const del = (sql, ...a) => tx.$executeRawUnsafe(sql, ...a);
    const n = {};
    n.audit_log = await del(`delete from audit_log where (entidade = 'orcamento' and entidade_id = any($1::text[])) or (entidade = 'formula' and entidade_id = any($2::text[])) or user_id = any($3::uuid[])`, orcTxt, formTxt, L2.usrTeste.map((u) => u.id));
    n.integration_events = await del(`delete from integration_events where entidade_tipo = 'orcamento' and entidade_id = any($1::text[])`, orcTxt);
    n.alertas = await del(`delete from alertas where entidade_tipo = 'formula' and entidade_id = any($1::int[])`, L2.apagar);
    n.formula_matches = await del(`delete from formula_matches where orcamento_id = any($1::uuid[])`, L2.orcIds);
    n.amostra_eventos = await del(`delete from amostra_eventos where orcamento_id = any($1::uuid[])`, L2.orcIds);
    n.pendencias_lab = await del(`delete from pendencias_lab where id = any($1::int[])`, L2.pendIds);
    if (L2.temPropostas) {
      n.proposta_itens = await del(`delete from proposta_itens where proposta_id = any($1::uuid[]) or orcamento_id = any($2::uuid[])`, L2.propIds, L2.orcIds);
      n.propostas = await del(`delete from propostas where id = any($1::uuid[])`, L2.propIds);
    }
    // um unico delete: a auto-referencia versao_de_id (versoes derivadas) e resolvida no mesmo comando
    n.orcamentos = await del(`delete from orcamentos where id = any($1::uuid[])`, L2.orcIds);
    n.formulas_arquivadas = await del(`update formulas set status = 'arquivada', updated_at = now() where id = any($1::int[])`, L2.arquivar);
    n.formula_composicao = exp.linhas.formula_composicao.length;
    // filhas antes das maes (auto-referencia formula_mae_id/derivada_de_id)
    n.formulas = 0;
    for (const id of [...L2.apagar].sort((a, b) => b - a)) n.formulas += await del(`delete from formulas where id = $1`, id);
    n.clientes = await del(`delete from clientes where id = any($1::uuid[])`, L2.cliIds);
    n.users = await del(`delete from users where id = any($1::uuid[])`, usrApagar);
    n.users_inativados = await del(`update users set ativo = false where id = any($1::uuid[])`, L2.usrTeste.map((u) => u.id).filter((id) => !usrApagar.includes(id)));

    const conteudo = {
      gerado_em: new Date().toISOString(),
      criterio: 'Ver cabecalho de prisma/limpar-testes-studio.cjs (clientes com "teste" no nome + lista; orcamentos deles; pendencias abertas a partir deles; formulas de formulacao_nova de teste apagadas, revisoes arquivadas; usuarios @localhost/@local.test).',
      incluiu_duvidas: DUVIDAS,
      resumo: n,
      ...exp,
    };
    fs.writeFileSync(arquivo, JSON.stringify(conteudo, null, 1));
    await tx.auditLog.create({ data: { user_id: admin?.id ?? null, acao: 'limpar_testes_studio', entidade: 'sistema', entidade_id: null, detalhes: { resumo: n, arquivo: path.relative(path.join(__dirname, '..'), arquivo).replace(/\\/g, '/') } } });
    return n;
  }, { timeout: 300000, maxWait: 30000 });

  console.log('\nAPLICADO. Removido/alterado por tabela:', resumo);
  console.log(`Copia de tudo em ${arquivo}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
