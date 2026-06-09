/**
 * Promocao das 814 formulas do banco original para o modelo
 * Familia (formula-mae + versoes) do Laboratorio Vivo (Doc 2b §A13).
 *
 * 1) Agrupa por (nome_produto normalizado + cliente_id)
 * 2) Ordena cada familia por data_criacao ASC (id como desempate cronologico)
 * 3) Mais antiga = MAE  (formula_mae_id=NULL, versao_codigo='1.0')
 * 4) Demais = versoes   (versao_codigo '1.1','1.2'...; derivada_de_id = anterior)
 * 5) Todas: status='validada', origem='banco_original', validada_por=admin
 *
 * Idempotente: o agrupamento e a ordenacao sao deterministicos, entao reexecutar
 * recalcula a mesma arvore.
 *
 * Rodar: npm run promote:formulas
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ADMIN_EMAIL = 'privatecosmeticosdrive@gmail.com';

function norm(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// roda promessas em lotes para nao saturar a conexao remota
async function inBatches<T>(items: T[], size: number, fn: (t: T) => Promise<any>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
    process.stdout.write(`\r  aplicados: ${Math.min(i + size, items.length)}/${items.length}`);
  }
  if (items.length) process.stdout.write('\n');
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) throw new Error('Admin nao encontrado — rode o seed antes.');
  const validada_em = new Date();

  const formulas = await prisma.formula.findMany({
    where: { origem: { in: ['banco_validado', 'banco_original'] } },
    select: { id: true, nome_produto: true, cliente_id: true, data_criacao: true },
  });
  console.log(`Formulas a promover: ${formulas.length}`);

  // 1) agrupa
  const familias = new Map<string, typeof formulas>();
  for (const f of formulas) {
    const key = `${norm(f.nome_produto)}|${f.cliente_id ?? ''}`;
    if (!familias.has(key)) familias.set(key, []);
    familias.get(key)!.push(f);
  }

  // 2) ordena cada familia cronologicamente (data ASC; id como desempate)
  const updates: {
    id: number;
    mae_id: number | null;
    derivada_de: number | null;
    versao: string;
  }[] = [];
  let totalVersoes = 0;
  const tamanhos: number[] = [];

  for (const fam of familias.values()) {
    fam.sort((a, b) => {
      const da = a.data_criacao ? a.data_criacao.getTime() : null;
      const db = b.data_criacao ? b.data_criacao.getTime() : null;
      if (da !== null && db !== null && da !== db) return da - db;
      return a.id - b.id;
    });
    tamanhos.push(fam.length);
    const mae = fam[0];
    updates.push({ id: mae.id, mae_id: null, derivada_de: null, versao: '1.0' });
    for (let i = 1; i < fam.length; i++) {
      updates.push({
        id: fam[i].id,
        mae_id: mae.id,
        derivada_de: fam[i - 1].id,
        versao: `1.${i}`,
      });
      totalVersoes++;
    }
  }

  // 3) aplica
  console.log(`Familias (maes): ${familias.size} · versoes derivadas: ${totalVersoes}`);
  await inBatches(updates, 25, (u) =>
    prisma.formula.update({
      where: { id: u.id },
      data: {
        formula_mae_id: u.mae_id,
        derivada_de_id: u.derivada_de,
        versao_codigo: u.versao,
        status: 'validada',
        origem: 'banco_original',
        validada_em,
        validada_por: admin.id,
        validacao_obs: 'Promovido automaticamente do banco original (v8).',
      },
    }),
  );

  // 4) estatisticas
  const maes = familias.size;
  const media = (formulas.length / maes).toFixed(2);
  const max = Math.max(...tamanhos);
  const min = Math.min(...tamanhos);
  const comUmaVersao = tamanhos.filter((t) => t === 1).length;
  console.log('\n========== PROMOCAO CONCLUIDA ==========');
  console.log(`Formulas-mae criadas    : ${maes}`);
  console.log(`Versoes derivadas       : ${totalVersoes}`);
  console.log(`Versoes por familia     : media ${media} · max ${max} · min ${min}`);
  console.log(`Familias com 1 so versao: ${comUmaVersao}`);
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
