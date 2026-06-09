/**
 * Baseline do historico de precos (Doc 2b §B10).
 * Cria 1 registro inicial em mp_historico_precos para cada MP existente:
 *   preco_kg_brl   = preco atual da MP
 *   data_cotacao   = data_cotacao da MP (fallback: hoje, se nula)
 *   origem         = 'import_inicial'
 *   fornecedor     = fornecedor principal (fallback: 'Nao informado')
 *   registrado_por = admin (Gabriel)
 *
 * Idempotente: remove os baselines anteriores (origem='import_inicial') antes
 * de recriar; NAO toca em entradas de atualizacao_rapida/cotacao_validada/etc.
 *
 * Rodar: npm run baseline:precos
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const ADMIN_EMAIL = 'privatecosmeticosdrive@gmail.com';
const CHUNK = 1000;

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) throw new Error('Admin nao encontrado — rode o seed antes.');
  const hoje = new Date();

  const mps = await prisma.materiaPrima.findMany({
    select: { id: true, preco_kg_brl: true, fornecedor: true, data_cotacao: true },
  });
  console.log(`MPs encontradas: ${mps.length}`);

  // idempotencia: limpa baselines anteriores
  const del = await prisma.mpHistoricoPreco.deleteMany({ where: { origem: 'import_inicial' } });
  if (del.count) console.log(`Baselines anteriores removidos: ${del.count}`);

  let semPreco = 0;
  let semFornecedor = 0;
  let semData = 0;
  const rows: Prisma.MpHistoricoPrecoCreateManyInput[] = mps.map((mp) => {
    if (mp.preco_kg_brl === null) semPreco++;
    if (!mp.fornecedor) semFornecedor++;
    if (!mp.data_cotacao) semData++;
    return {
      mp_id: mp.id,
      preco_kg_brl: mp.preco_kg_brl ?? new Prisma.Decimal(0),
      fornecedor: mp.fornecedor || 'Nao informado',
      data_cotacao: mp.data_cotacao ?? hoje,
      origem: 'import_inicial',
      registrado_por: admin.id,
    };
  });

  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    await prisma.mpHistoricoPreco.createMany({ data: batch });
    done += batch.length;
    process.stdout.write(`\r  inseridos: ${done}/${rows.length}`);
  }
  if (rows.length) process.stdout.write('\n');

  const total = await prisma.mpHistoricoPreco.count({ where: { origem: 'import_inicial' } });
  console.log('\n========== BASELINE CONCLUIDO ==========');
  console.log(`Registros import_inicial : ${total}`);
  console.log(`MPs sem preco (usou 0)   : ${semPreco}`);
  console.log(`MPs sem fornecedor       : ${semFornecedor}`);
  console.log(`MPs sem data (usou hoje) : ${semData}`);
  console.log('========================================');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('\nOK ✅');
  })
  .catch(async (e) => {
    console.error('\nFalhou ❌', e);
    await prisma.$disconnect();
    process.exit(1);
  });
