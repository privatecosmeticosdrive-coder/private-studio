/* eslint-disable no-console */
// ============================================================================
// COMPARADOR READ-ONLY — modelo de MO vigente × rodada 2 (F2).
//
// NADA GRAVA. NADA MUDA DE PREÇO. O engine vigente é INTOCADO: o script chama
// `gerarCalculo` (que só lê) e recompõe o preço novo substituindo APENAS o
// componente de MO, reaplicando as MESMAS alíquotas que o engine emitiu
// (taxa_pct por parcela, ipi_pct, base_ipi). Nenhuma regra fiscal é duplicada.
//
// DECOMPOSIÇÃO POR CAUSA — cadeia aditiva, um passo de cada vez:
//   M0 vigente        mo_diario × ceil(qtd / (un_min×480)) / qtd
//   M1 fim do ceil    tempo contínuo, mesma base e mesmo 480
//   M2 minutos reais  480 -> horas×60×eficiencia (393,6)
//   M3 base de custo  folha inteira (75.000) -> custo de produção (83.084)
//   M4 capacidade     1 linha -> linhas_paralelas (2,5)
//   M5 setup          + custo_setup_ordem / qtd   (= modelo final rodada 2)
// O efeito de cada causa é a diferença entre dois elos consecutivos.
//
// NOTA HONESTA: o `custo_fixo_mensal=120.240` NUNCA entrou em preço nenhum —
// é da Matriz (modelo paralelo), não do engine. O engine sempre usou
// `mo_folha_mensal`. Por isso a causa real é 75.000 -> 83.084, não 120.240.
//
// USO: npx ts-node --transpile-only -P prisma/tsconfig.json prisma/comparar-mo-rodada2.ts
// ============================================================================

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { CalculoService } from '../src/orcamentos/calculo.service';
import { calcularCustoProducao, type ParametrosProducao } from '../src/orcamentos/custo-producao.util';

const brl = (n: number) => `R$ ${n.toFixed(2)}`;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

/** Lê a vigência aberta de parametro_producao (nunca literais). */
async function lerParametrosProducao(prisma: PrismaClient): Promise<ParametrosProducao> {
  const linhas = await prisma.parametroProducao.findMany({ where: { vigencia_fim: null } });
  const v = (chave: string) => {
    const l = linhas.find((x) => x.chave === chave);
    if (!l) throw new Error(`parametro_producao sem vigencia aberta para "${chave}"`);
    return Number(l.valor);
  };
  return {
    custo_fixo_producao_mensal: v('custo_fixo_producao_mensal'),
    linhas_paralelas: v('linhas_paralelas'),
    eficiencia_producao: v('eficiencia_producao'),
    setup_minutos: v('setup_minutos'),
    dias_uteis_mes: v('dias_uteis_mes'),
    horas_dia: v('horas_dia'),
  };
}

/** Gross-up idêntico ao do engine, com a alíquota que ELE emitiu. */
const precoParcela = (custo: number, margem: number, taxa: number) => custo / (1 - (margem + taxa) / 100);

/**
 * Recompõe o preço trocando só o custo de MO por unidade.
 * Usa as alíquotas emitidas no cálculo — zero regra fiscal duplicada.
 */
function precoComMo(c: any, mo_un: number) {
  const modo = c.modo_operacao as string;
  const margem = c.resultado.margem_pct as number;
  const mat = c.parcelas.material;
  const mo = c.parcelas.mo;
  const custo_material_un = c.material.custo_material_un as number;

  let precoMat = 0;
  let precoMo = 0;
  if (modo === 'full_service') {
    precoMat = precoParcela(custo_material_un + mo_un, margem, mat.taxa_pct);
  } else if (modo === 'hibrido') {
    precoMat = precoParcela(custo_material_un, margem, mat.taxa_pct);
    precoMo = precoParcela(mo_un, margem, mo.taxa_pct);
  } else {
    precoMo = precoParcela(custo_material_un + mo_un, margem, mo.taxa_pct);
  }
  const preco_sipi = precoMat + precoMo;
  const base = c.resultado.base_ipi === 'total' ? preco_sipi : c.resultado.base_ipi === 'material' ? precoMat : 0;
  const ipi_un = base * ((c.resultado.ipi_pct as number) / 100);
  // ICMS sobre IPI: proporcional ao que o engine emitiu (mesma condição/alíquota)
  const icmsSobreIpiAtual = (c.resultado.icms_sobre_ipi as number) ?? 0;
  const ipiAtual = (c.resultado.ipi_un as number) ?? 0;
  const icms_sobre_ipi = ipiAtual > 0 ? icmsSobreIpiAtual * (ipi_un / ipiAtual) : 0;
  return preco_sipi + ipi_un + icms_sobre_ipi;
}

async function main() {
  const prisma = new PrismaService();
  const svc = new CalculoService(prisma);
  const P = await lerParametrosProducao(prisma as unknown as PrismaClient);

  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 } });
  const folha = Number(cfg!.mo_folha_mensal);
  const diasCfg = Number(cfg!.mo_dias_uteis);

  const minProdDia = P.horas_dia * 60 * P.eficiencia_producao;
  const capacidade = P.linhas_paralelas * P.dias_uteis_mes * P.horas_dia * 60 * P.eficiencia_producao;
  const taxaMinuto = P.custo_fixo_producao_mensal / capacidade;
  const setupOrdem = taxaMinuto * P.setup_minutos;

  console.log('='.repeat(78));
  console.log('COMPARADOR MO — vigente × rodada 2   (READ-ONLY, nada grava)');
  console.log('='.repeat(78));
  console.log(`VIGENTE : folha ${brl(folha)}/mês ÷ ${diasCfg} dias · produção = un_min × 480 · ceil de dia inteiro`);
  console.log(`RODADA 2: custo produção ${brl(P.custo_fixo_producao_mensal)}/mês · ${P.linhas_paralelas} linhas · efic ${(P.eficiencia_producao * 100).toFixed(0)}%`);
  console.log(`          capacidade ${capacidade.toFixed(0)} min/mês · taxa ${brl(taxaMinuto)}/min · setup ${brl(setupOrdem)}/ordem · ${minProdDia.toFixed(1)} min prod/dia\n`);

  const orcs = await prisma.orcamento.findMany({
    where: {
      NOT: { calculo: { equals: Prisma.DbNull } },
      quantidade: { not: null },
      un_min: { not: null },
    },
    select: { id: true, numero: true, produto: true, quantidade: true, un_min: true, modo_operacao: true },
    orderBy: { numero: 'asc' },
  });

  const linhas: any[] = [];
  for (const o of orcs) {
    let c: any;
    try {
      const r = await svc.gerarCalculo(o.id, {}); // READ-ONLY
      c = r.calculo;
    } catch (e) {
      console.log(`#${o.numero} PULADO — ${(e as Error).message.slice(0, 70)}`);
      continue;
    }
    if (!c?.parcelas || !c?.mao_de_obra) { console.log(`#${o.numero} PULADO — cálculo v1 legado`); continue; }

    const qtd = Number(o.quantidade);
    const unMin = Math.max(0.01, Number(o.un_min));
    const moDiario = folha / diasCfg;

    // ---- cadeia de causas ----
    const m0 = c.mao_de_obra.mo_un as number;                       // vigente (com ceil)
    const m1 = moDiario / (unMin * 480);                            // fim do ceil
    const m2 = moDiario / (unMin * minProdDia);                     // minutos produtivos reais
    const m3 = P.custo_fixo_producao_mensal / P.dias_uteis_mes / (unMin * minProdDia); // base de custo
    const novo = calcularCustoProducao(P, unMin, qtd);
    const m4 = novo.corrida_un;                                     // capacidade (linhas paralelas)
    const m5 = novo.custo_producao_un;                              // + setup explícito

    const pAtual = c.resultado.preco_cipi as number;
    const pNovo = precoComMo(c, m5);
    const deltaPreco = ((pNovo - pAtual) / pAtual) * 100;

    linhas.push({
      numero: o.numero, produto: o.produto.slice(0, 26), modo: c.modo_operacao,
      qtd, unMin, diasCeil: c.mao_de_obra.dias_necessarios,
      m0, m5, pAtual, pNovo, deltaPreco,
      causas: {
        ceil: m1 - m0, minutos: m2 - m1, base: m3 - m2, capacidade: m4 - m3, setup: m5 - m4,
      },
    });
  }

  if (linhas.length === 0) { console.log('Nenhum orçamento comparável.'); await prisma.$disconnect(); return; }

  // ---- por orçamento ----
  console.log('POR ORÇAMENTO (MO por unidade e preço c/ IPI)');
  console.log('-'.repeat(78));
  for (const l of linhas) {
    console.log(`#${l.numero} ${l.produto.padEnd(26)} ${l.modo.padEnd(18)} qtd=${String(l.qtd).padStart(6)} un/min=${l.unMin}`);
    console.log(`   MO/un  ${brl(l.m0).padStart(11)} -> ${brl(l.m5).padStart(11)}   (ceil cobrava ${l.diasCeil} dia(s))`);
    console.log(`   preço  ${brl(l.pAtual).padStart(11)} -> ${brl(l.pNovo).padStart(11)}   ${pct(l.deltaPreco)}`);
    console.log(`   causas na MO/un: ceil ${brl(l.causas.ceil)} | min.produtivos ${brl(l.causas.minutos)} | base custo ${brl(l.causas.base)} | capacidade ${brl(l.causas.capacidade)} | setup ${brl(l.causas.setup)}`);
  }

  // ---- agregado ----
  const med = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const deltas = linhas.map((l) => l.deltaPreco);
  const ordenado = [...linhas].sort((a, b) => a.deltaPreco - b.deltaPreco);
  const maisCai = ordenado[0];
  const maisSobe = ordenado[ordenado.length - 1];
  const sobem = linhas.filter((l) => l.deltaPreco > 0).length;

  console.log('\n' + '='.repeat(78));
  console.log(`AGREGADO — ${linhas.length} orçamentos`);
  console.log('='.repeat(78));
  console.log(`efeito médio no preço: ${pct(med(deltas))} | mediana: ${pct([...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)])}`);
  console.log(`sobem: ${sobem} | caem: ${linhas.length - sobem}`);
  console.log(`ONDE MAIS CAI  #${maisCai.numero} ${maisCai.produto} ${pct(maisCai.deltaPreco)} — qtd ${maisCai.qtd}, ceil cobrava ${maisCai.diasCeil} dia(s)`);
  console.log(`ONDE MAIS SOBE #${maisSobe.numero} ${maisSobe.produto} ${pct(maisSobe.deltaPreco)} — qtd ${maisSobe.qtd}, ceil cobrava ${maisSobe.diasCeil} dia(s)`);
  console.log('\nEFEITO MÉDIO DE CADA CAUSA NA MO/un (R$):');
  for (const k of ['ceil', 'minutos', 'base', 'capacidade', 'setup'] as const) {
    console.log(`  ${k.padEnd(12)} ${brl(med(linhas.map((l) => l.causas[k]))).padStart(12)}`);
  }
  // ---- ALERTA DE REPRESENTATIVIDADE ----
  const qtds = new Set(linhas.map((l) => l.qtd));
  console.log('\n' + '!'.repeat(78));
  console.log('REPRESENTATIVIDADE DA AMOSTRA — ler ANTES de usar o número agregado');
  console.log('!'.repeat(78));
  console.log(`quantidades distintas na base: ${[...qtds].join(', ')} (${qtds.size} valor(es))`);
  if (qtds.size === 1) {
    console.log('>> A base inteira tem UMA SÓ quantidade. O agregado acima NÃO mede impacto');
    console.log('   comercial: mede a diferença dos modelos num único tamanho de lote.');
    console.log('   O efeito do ceil é MÁXIMO em lote pequeno — e some em lote grande.');
    console.log('   Use a SIMULAÇÃO PARAMÉTRICA abaixo para a diferença ESTRUTURAL.');
  }

  // ---- SIMULAÇÃO PARAMÉTRICA: velocidades TÍPICAS REAIS × faixas de lote ----
  // Isola a diferença ESTRUTURAL variando lote e velocidade, resto fixo.
  // Velocidades: 4 (sérum/creme lento), 6 (shampoo típico) e a do Camuflage
  // Light lida de parametro_producao (25 un/min — informação direta do Gabriel,
  // ago/2026; o mapeamento antigo de 4 un/min estava 5-7× errado).
  const camuflageParam = await prisma.parametroProducao.findFirst({
    where: { chave: 'velocidade_camuflage_light_un_min', vigencia_fim: null },
  });
  const velCamuflage = camuflageParam ? Number(camuflageParam.valor) : 25;
  const moDiarioSim = folha / diasCfg;
  console.log('\n' + '='.repeat(78));
  console.log('SIMULAÇÃO PARAMÉTRICA — velocidades típicas reais × faixa de lote');
  console.log('='.repeat(78));
  for (const [rotulo, unMinSim] of [
    ['sérum/creme lento (4 un/min)', 4],
    ['shampoo típico (6 un/min)', 6],
    [`Camuflage Light (${velCamuflage} un/min — 26% do volume)`, velCamuflage],
  ] as const) {
    console.log(`\n  ${rotulo}`);
    console.log('  lote      MO vigente     MO rodada2      Δ MO      dias(ceil)   setup/un');
    const unDiaSim = unMinSim * 480;
    for (const q of [250, 1000, 3000, 8000]) {
      const dias = Math.ceil(q / unDiaSim);
      const moV = (moDiarioSim * dias) / q;
      const n = calcularCustoProducao(P, unMinSim, q);
      const d = ((n.custo_producao_un - moV) / moV) * 100;
      console.log(
        `  ${String(q).padStart(6)}  ${brl(moV).padStart(12)}  ${brl(n.custo_producao_un).padStart(12)}  ${pct(d).padStart(8)}  ${String(dias).padStart(8)}   ${brl(n.setup_un).padStart(8)}`,
      );
    }
  }
  console.log('\n  Leitura: onde dias(ceil) é 1 e o lote é pequeno, o vigente cobra um dia');
  console.log('  inteiro da folha por poucas horas de trabalho — é ali que a queda é grande.');
  console.log('  Com o lote grande o ceil se dilui e sobra a diferença ESTRUTURAL dos modelos.');
  console.log('\n  NOTA (Gabriel, ago/2026): industrialização por encomenda de pomander/buddha/');
  console.log('  spray de ambiente é lançamento FISCAL 1:1 junto do produto — NÃO consome');
  console.log('  minuto de capacidade. Fica FORA do cálculo de ocupação. O modo fiscal');
  console.log('  "industrializacao" do engine segue existindo (é enquadramento tributário).');

  // ---- MOQ econômico ----
  const moq = await prisma.parametroProducao.findFirst({ where: { chave: 'moq_economico_valor', vigencia_fim: null } });
  if (moq) {
    console.log(`\nMOQ econômico (política): custo do lote >= ${brl(Number(moq.valor))} faz o setup pesar <= 10%.`);
    console.log(`  setup por ordem = ${brl(setupOrdem)} -> 10% disso exige lote de custo >= ${brl(setupOrdem * 10)}.`);
  }

  console.log('\nLembrete: ociosidade e SG&A NÃO entram no custo do produto (CPC 16 item 13).');
  console.log('A taxa/min recupera o custo fixo SÓ com a capacidade NORMAL ocupada — abaixo');
  console.log('disso a diferença é ociosidade, que vai para o resultado do período, não pro preço.');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
