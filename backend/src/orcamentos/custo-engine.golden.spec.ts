/**
 * REGRESSÃO DE PREÇO v2 (F4 Fase A — pós-corte). Cada golden em test/goldens/
 * congela o contexto fiscal completo de um orçamento (inputs, oper, modo,
 * perfil, ncm, params, caracterizacao) + o esperado. Este spec RECONSTRÓI os
 * tributos (matriz fiscal) e RECOMPUTA o preço (engine fiscal) sobre as MESMAS
 * entradas, exigindo igualdade campo a campo, tolerância ZERO.
 *
 * Cobre os 3 modos: orcamento-*.json (full_service, 15 reais) +
 * sintetico-hibrido.json + sintetico-industrializacao.json.
 *
 * Se quebrar, o engine fiscal OU a matriz mudou de comportamento — gate da F4.
 * Sem banco, sem Nest: só as funções puras.
 */
import * as fs from 'fs';
import * as path from 'path';
import { calcularCustoFiscal } from './custo-engine-fiscal';
import { resolverTributosSaida } from './matriz-fiscal.util';

const GOLDENS_DIR = path.join(__dirname, '..', '..', 'test', 'goldens');

const arquivos = fs.readdirSync(GOLDENS_DIR).filter((f) => f.endsWith('.json')).sort();

describe('engine fiscal — golden files de regressão de preço (3 modos)', () => {
  it('existe ao menos um golden de cada modo', () => {
    const modos = new Set(
      arquivos.map((a) => JSON.parse(fs.readFileSync(path.join(GOLDENS_DIR, a), 'utf8')).modo_operacao),
    );
    expect(modos.has('full_service')).toBe(true);
    expect(modos.has('hibrido')).toBe(true);
    expect(modos.has('industrializacao')).toBe(true);
  });

  it.each(arquivos)('%s reproduz o preço congelado', (arquivo) => {
    const g = JSON.parse(fs.readFileSync(path.join(GOLDENS_DIR, arquivo), 'utf8'));
    const tributos = resolverTributosSaida(g.modo_operacao, g.perfil, g.ncm, g.params, g.caracterizacao);
    const vivo = calcularCustoFiscal(g.inputs, g.oper, tributos);
    expect({
      material: vivo.material,
      mao_de_obra: vivo.mao_de_obra,
      parcelas: vivo.parcelas,
      resultado: vivo.resultado,
      fundamentos: vivo.fundamentos,
    }).toEqual(g.esperado);
  });
});
