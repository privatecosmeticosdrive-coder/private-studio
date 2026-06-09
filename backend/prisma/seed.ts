/**
 * Seed idempotente do Private Studio.
 *  - Usuario admin inicial (Gabriel)
 *  - system_config (linha unica id=1) com parametros do modelo de custo Private
 *
 * Rodar:  npm run seed
 * Senha do admin: env ADMIN_PASSWORD (default "PrivateStudio@2026" — TROCAR no 1o login).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'privatecosmeticosdrive@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'PrivateStudio@2026';

// Produtividade por faixa de etapas (Doc 1, secao 6).
const PRODUTIVIDADE_ETAPAS = [
  { faixa: '2-3', un_min: 6, un_dia: 2880 },
  { faixa: '4-5', un_min: 4, un_dia: 1920 },
  { faixa: '6-7', un_min: 2.5, un_dia: 1200 },
  { faixa: '8+', un_min: 1.5, un_dia: 720 },
];

async function main() {
  // 1) Admin Gabriel ------------------------------------------------------
  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { nome: 'Gabriel', role: 'admin', ativo: true },
    create: {
      email: ADMIN_EMAIL,
      nome: 'Gabriel',
      password_hash,
      role: 'admin',
      ativo: true,
    },
  });
  console.log(`✔ Admin: ${admin.nome} <${admin.email}> (role=${admin.role})`);

  // 2) system_config (id=1) ----------------------------------------------
  await prisma.systemConfig.upsert({
    where: { id: 1 },
    update: { produtividade_etapas: PRODUTIVIDADE_ETAPAS },
    create: {
      id: 1,
      mo_folha_mensal: 75000,
      mo_dias_uteis: 20,
      mo_colaboradores: 11,
      imposto_mp_pct: 37.5,
      imposto_mo_pct: 9.25,
      ipi_pct: 4.55,
      desvio_mp_pct: 10,
      frete_un_brl: 0.1,
      produtividade_etapas: PRODUTIVIDADE_ETAPAS,
    },
  });
  console.log('✔ system_config carregado (MO R$75k, impostos, produtividade).');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('\nSeed concluido ✅');
  })
  .catch(async (e) => {
    console.error('Seed falhou ❌', e);
    await prisma.$disconnect();
    process.exit(1);
  });
