/* eslint-disable no-console */
// ============================================================================
// GERADOR DE GOLDEN FILES — regressão de preço (pré-requisito do corte da F4).
//
// LEITURA PURA no banco (nenhum UPDATE/INSERT). Para cada orçamento com
// JSON_CALC travado:
//   1. Lê inputs + parametros + saídas do calculo gravado (preço HISTÓRICO).
//   2. Roda calcularCustoPrivate(inputs, parametros) com o engine ATUAL (VIVO).
//   3. Compara campo a campo, tolerância zero.
//      - BATE   -> grava test/goldens/orcamento-<numero>.json
//      - DIVERGE -> NÃO grava; entra na lista de divergências do relatório.
//
// Divergência = o engine mudou desde que o orçamento foi calculado. Qual é a
// verdade (histórico congelado vs engine atual) é decisão de NEGÓCIO — o
// script só reporta, nunca decide.
//
// USO: npx ts-node --transpile-only -P prisma/tsconfig.json prisma/gerar-goldens.ts
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  calcularCustoPrivate,
  InputsCusto,
  ParametrosCusto,
} from '../src/orcamentos/custo-engine';

const GOLDENS_DIR = path.join(__dirname, '..', 'test', 'goldens');

type Divergencia = { campo: string; banco: unknown; engine: unknown };

// Compara folha a folha (os 3 blocos de saída são objetos rasos de números).
function diffCampos(banco: any, engine: any, prefixo: string): Divergencia[] {
  const out: Divergencia[] = [];
  const chaves = new Set([...Object.keys(banco ?? {}), ...Object.keys(engine ?? {})]);
  for (const k of chaves) {
    const b = banco?.[k];
    const e = engine?.[k];
    if (b !== null && typeof b === 'object') {
      out.push(...diffCampos(b, e, `${prefixo}${k}.`));
    } else if (b !== e) {
      out.push({ campo: `${prefixo}${k}`, banco: b, engine: e });
    }
  }
  return out;
}

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.orcamento.findMany({
    where: { calculo: { not: null } },
    select: { id: true, numero: true, calculo: true },
    orderBy: { numero: 'asc' },
  });
  await prisma.$disconnect();

  fs.mkdirSync(GOLDENS_DIR, { recursive: true });

  let bateram = 0;
  const divergentes: { numero: number; diffs: Divergencia[] }[] = [];

  for (const r of rows) {
    const c = r.calculo as any;
    const inputs = c.inputs as InputsCusto;
    const parametros = c.parametros as ParametrosCusto;
    const historico = {
      custo_mp: c.custo_mp,
      mao_de_obra: c.mao_de_obra,
      resultado: c.resultado,
    };
    const vivo = calcularCustoPrivate(inputs, parametros);
    const diffs = diffCampos(historico, vivo, '');

    if (diffs.length === 0) {
      const golden = {
        _fonte: `orcamento ${r.numero} (id ${r.id}), JSON_CALC versao ${c._modelo_versao}`,
        _gerado_de: c._gerado_em,
        inputs,
        parametros,
        esperado: historico,
      };
      fs.writeFileSync(
        path.join(GOLDENS_DIR, `orcamento-${r.numero}.json`),
        JSON.stringify(golden, null, 2) + '\n',
      );
      bateram++;
      console.log(`#${r.numero} BATEU -> golden gravado`);
    } else {
      divergentes.push({ numero: r.numero, diffs });
      console.log(`#${r.numero} DIVERGIU (${diffs.length} campo(s)) -> golden NAO gravado`);
      for (const d of diffs) {
        console.log(`    ${d.campo}: banco=${JSON.stringify(d.banco)} engine=${JSON.stringify(d.engine)}`);
      }
    }
  }

  console.log('\n================ PLACAR ================');
  console.log(`Total: ${rows.length} | bateram (golden): ${bateram} | divergiram: ${divergentes.length}`);
  if (divergentes.length > 0) {
    console.log('Divergentes:', divergentes.map((d) => `#${d.numero}`).join(', '));
    console.log('NENHUM golden gravado para os divergentes — decisão de negócio pendente.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
