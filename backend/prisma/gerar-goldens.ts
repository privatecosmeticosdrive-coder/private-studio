/* eslint-disable no-console */
// ============================================================================
// GERADOR DE GOLDEN FILES v2 (F4 Fase A — pós-corte). Regressão de PREÇO do
// engine fiscal granular (custo-engine-fiscal + matriz-fiscal). Cobre os 3
// modos: os 15 orçamentos reais (full_service) + 2 sintéticos (híbrido e
// industrialização), criados e EXCLUÍDOS ao final (guarda por prefixo).
//
// LEITURA no cálculo (gerarCalculo NÃO persiste); as únicas escritas são a
// criação/exclusão dos 2 orçamentos sintéticos (reversíveis, com guarda).
//
// Cada golden congela o CONTEXTO fiscal completo (inputs, oper, modo, perfil,
// ncm, params, caracterizacao) + o esperado (material/mao_de_obra/parcelas/
// resultado/fundamentos). O spec reconstrói tributos e recomputa, tolerância 0.
//
// USO: npx ts-node --transpile-only -P prisma/tsconfig.json prisma/gerar-goldens.ts
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { CalculoService } from '../src/orcamentos/calculo.service';
import { lerParametrosFiscaisVigentes } from '../src/orcamentos/params-fiscais.util';
import type { NcmFiscal } from '../src/orcamentos/matriz-fiscal.util';

const GOLDENS_DIR = path.join(__dirname, '..', 'test', 'goldens');

async function contextoFiscal(prisma: PrismaClient, orc: any) {
  const formulaNcm = orc.formula_id
    ? await prisma.formula.findUnique({ where: { id: orc.formula_id }, select: { ncm_id: true } })
    : null;
  const ncmId = orc.ncm_id ?? formulaNcm?.ncm_id ?? null;
  const ncmRow = ncmId ? await prisma.ncm.findUnique({ where: { id: ncmId } }) : null;
  if (!ncmRow) throw new Error(`orcamento ${orc.numero} sem NCM efetivo`);
  const ncm: NcmFiscal = {
    ncm: ncmRow.ncm,
    ex_tipi: ncmRow.ex_tipi,
    ipi_pct: Number(ncmRow.ipi_pct),
    monofasico: ncmRow.monofasico,
    tratamento: ncmRow.tratamento as NcmFiscal['tratamento'],
    icms_nominal_pct: ncmRow.icms_nominal_pct != null ? Number(ncmRow.icms_nominal_pct) : null,
  };
  const { params, caracterizacao } = await lerParametrosFiscaisVigentes(prisma as any);
  return { ncm, params, caracterizacao };
}

async function golden(svc: CalculoService, prisma: PrismaClient, orc: any) {
  const r = await svc.gerarCalculo(orc.id, {}); // read-only
  const c: any = r.calculo;
  const { ncm, params, caracterizacao } = await contextoFiscal(prisma, orc);
  return {
    _fonte: `orcamento ${orc.numero} (id ${orc.id}) — engine fiscal ${c._modelo_versao}`,
    modo_operacao: c.modo_operacao,
    inputs: c.inputs,
    oper: c.parametros_operacionais,
    perfil: c.perfil_fiscal,
    ncm,
    params,
    caracterizacao,
    esperado: {
      material: c.material,
      mao_de_obra: c.mao_de_obra,
      parcelas: c.parcelas,
      resultado: c.resultado,
      fundamentos: c.fundamentos,
    },
  };
}

async function main() {
  const prisma = new PrismaService();
  const svc = new CalculoService(prisma);

  fs.mkdirSync(GOLDENS_DIR, { recursive: true });
  // limpa goldens v1 (substituídos — git preserva o histórico)
  for (const f of fs.readdirSync(GOLDENS_DIR)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(GOLDENS_DIR, f));
  }

  // ---- 15 reais (full_service) — BASELINE FIXO, por número ----
  // NÃO varrer todos os calculados: golden é rede de regressão e precisa ser
  // ESTÁVEL e representativo. Varredura infla a suíte com orçamentos de cliente
  // fictício (uma mudança futura quebraria 30 arquivos em vez de 17) e
  // cristaliza dado de teste como referência. A expansão do baseline é decisão
  // DELIBERADA — quando houver orçamentos reais representativos, acrescente o
  // número aqui de propósito.
  const NUMEROS_BASELINE = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
  const reais = await prisma.orcamento.findMany({
    where: { numero: { in: NUMEROS_BASELINE }, NOT: { calculo: { equals: Prisma.DbNull } } },
    select: { id: true, numero: true, formula_id: true, ncm_id: true },
    orderBy: { numero: 'asc' },
  });
  if (reais.length !== NUMEROS_BASELINE.length) {
    const achados = reais.map((r) => r.numero);
    console.log(
      `AVISO: baseline esperava ${NUMEROS_BASELINE.length} orcamentos, achou ${reais.length}. ` +
        `Faltando: ${NUMEROS_BASELINE.filter((n) => !achados.includes(n)).join(', ')}`,
    );
  }
  // Orçamento sem NCM efetivo NÃO calcula (regra 6 — falha visível, F4A) e por
  // isso não pode virar golden: PULA com aviso em vez de abortar a geração
  // inteira. É lacuna de DADO daquele orçamento, não regressão do engine.
  let pulados = 0;
  for (const orc of reais) {
    let g: Awaited<ReturnType<typeof golden>>;
    try {
      g = await golden(svc, prisma, orc);
    } catch (e) {
      console.log(`#${orc.numero} PULADO — ${(e as Error).message.slice(0, 80)}`);
      pulados++;
      continue;
    }
    fs.writeFileSync(path.join(GOLDENS_DIR, `orcamento-${orc.numero}.json`), JSON.stringify(g, null, 2) + '\n');
    console.log(`#${orc.numero} (${g.modo_operacao}) -> cipi ${g.esperado.resultado.preco_cipi}`);
  }
  if (pulados > 0) console.log(`(${pulados} orcamento(s) pulado(s) por falta de NCM efetivo)`);

  // ---- 2 sintéticos (híbrido + industrialização) — criados e excluídos ----
  const cli = await prisma.cliente.findFirst({ where: { nome: 'Teste Agente' }, select: { id: true } });
  const ncmShampoo = await prisma.ncm.findUnique({ where: { ncm_ex_tipi: { ncm: '3305.10.00', ex_tipi: '' } }, select: { id: true } });
  const sinteticos = [
    { modo: 'hibrido', nome: 'GOLDEN-SINT hibrido' },
    { modo: 'industrializacao', nome: 'GOLDEN-SINT industrializacao' },
  ];
  const criados: string[] = [];
  try {
    for (const s of sinteticos) {
      const orc = await prisma.orcamento.create({
        data: {
          produto: s.nome, cliente_id: cli!.id, ncm_id: ncmShampoo!.id, modo_operacao: s.modo,
          quantidade: 1000, volume_un: 200, un_min: 4, margem_pct: 30, budget_mp: 50,
          sem_embalagem: true, status: 'rascunho',
        },
        select: { id: true, numero: true, formula_id: true, ncm_id: true },
      });
      criados.push(orc.id);
      const g = await golden(svc, prisma, { ...orc, numero: s.modo });
      fs.writeFileSync(path.join(GOLDENS_DIR, `sintetico-${s.modo}.json`), JSON.stringify(g, null, 2) + '\n');
      console.log(`sintetico ${s.modo} -> cipi ${g.esperado.resultado.preco_cipi}`);
    }
  } finally {
    const del = await prisma.orcamento.deleteMany({ where: { id: { in: criados }, produto: { startsWith: 'GOLDEN-SINT' } } });
    console.log(`limpeza sinteticos: ${del.count} excluido(s) | total orcamentos:`, await prisma.orcamento.count());
  }

  await prisma.$disconnect();
  console.log(`\nGoldens v2 gravados em ${GOLDENS_DIR} (15 reais + 2 sinteticos).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
