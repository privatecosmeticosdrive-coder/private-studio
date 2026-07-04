/**
 * REGRESSÃO DE PREÇO — golden files (pré-requisito do corte da F4).
 *
 * Cada golden em test/goldens/ congela inputs + parametros + saídas de um
 * orçamento real (gerados por prisma/gerar-goldens.ts, validados contra o
 * JSON_CALC do banco). Este spec re-roda o engine puro sobre as MESMAS
 * entradas e exige igualdade campo a campo, tolerância ZERO.
 *
 * Se este teste quebrar, o engine mudou de comportamento: gate da F4 —
 * "preço novo == preço velho OU divergência explicada e aprovada".
 * Sem banco, sem Nest — só o engine puro.
 */
import * as fs from 'fs';
import * as path from 'path';
import { calcularCustoPrivate } from './custo-engine';

const GOLDENS_DIR = path.join(__dirname, '..', '..', 'test', 'goldens');

const arquivos = fs
  .readdirSync(GOLDENS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

describe('custo-engine — golden files de regressão de preço', () => {
  it('existe pelo menos um golden', () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  it.each(arquivos)('%s reproduz o preço congelado', (arquivo) => {
    const golden = JSON.parse(
      fs.readFileSync(path.join(GOLDENS_DIR, arquivo), 'utf8'),
    );
    const vivo = calcularCustoPrivate(golden.inputs, golden.parametros);
    expect(vivo).toEqual(golden.esperado);
  });
});
