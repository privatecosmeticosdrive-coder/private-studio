/**
 * REGRESSÃO DE PREÇO v2 (F4 Fase A — pós-corte) + MOTOR 2 10/26. Cada golden
 * em test/goldens/ congela o contexto fiscal completo de um orçamento (inputs,
 * oper, modo, perfil, ncm, params, caracterizacao) + o esperado. Este spec
 * RECONSTRÓI os tributos (matriz fiscal) e RECOMPUTA o preço sobre as MESMAS
 * entradas, exigindo igualdade campo a campo, tolerância ZERO.
 *
 * Dois motores, deliberadamente:
 *  - goldens SEM campo `motor` (ou motor=1): Motor 1 (`calcularCustoFiscal`) —
 *    os 15 reais (full_service) + 2 sintéticos seguem congelados como estavam,
 *    porque snapshots antigos são reproduzidos por ele.
 *  - goldens com `motor: 2` (motor2-*.json): Motor 2 (`calcularCustoMotor2`),
 *    com `oper` no formato ParametrosMotor2. Os 5 goldens motor2 são os casos
 *    de referência validados pelo dono (docs/precificacao/MOTOR-2-10-26.md).
 *
 * Se quebrar, um engine OU a matriz mudou de comportamento — gate da F4/10-26.
 * Sem banco, sem Nest: só as funções puras.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  calcularCustoFiscal,
  type InputsFiscal,
  type ParametrosOperacionaisFiscal,
} from './custo-engine-fiscal';
import {
  calcularCustoMotor2,
  type InputsMotor2,
  type ParametrosMotor2,
} from './custo-engine-motor2';
import {
  resolverTributosSaida,
  type CaracterizacaoFiscal,
  type ModoOperacao,
  type NcmFiscal,
  type ParametrosFiscaisVigentes,
  type PerfilClienteFiscal,
} from './matriz-fiscal.util';

interface Golden {
  motor?: 1 | 2;
  modo_operacao: ModoOperacao;
  inputs: InputsFiscal | InputsMotor2;
  oper: ParametrosOperacionaisFiscal | ParametrosMotor2;
  perfil: PerfilClienteFiscal;
  ncm: NcmFiscal;
  params: ParametrosFiscaisVigentes;
  caracterizacao: CaracterizacaoFiscal;
  esperado: unknown;
}

const GOLDENS_DIR = path.join(__dirname, '..', '..', 'test', 'goldens');

const arquivos = fs
  .readdirSync(GOLDENS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();
const ler = (a: string): Golden =>
  JSON.parse(fs.readFileSync(path.join(GOLDENS_DIR, a), 'utf8')) as Golden;

describe('engines — golden files de regressão de preço (3 modos, 2 motores)', () => {
  it('existe ao menos um golden de cada modo', () => {
    const modos = new Set(arquivos.map((a) => ler(a).modo_operacao));
    expect(modos.has('full_service')).toBe(true);
    expect(modos.has('hibrido')).toBe(true);
    expect(modos.has('industrializacao')).toBe(true);
  });

  it('existe ao menos um golden de cada motor', () => {
    const motores = new Set(arquivos.map((a) => ler(a).motor ?? 1));
    expect(motores.has(1)).toBe(true);
    expect(motores.has(2)).toBe(true);
  });

  it.each(arquivos)('%s reproduz o preço congelado', (arquivo) => {
    const g = ler(arquivo);
    const tributos = resolverTributosSaida(
      g.modo_operacao,
      g.perfil,
      g.ncm,
      g.params,
      g.caracterizacao,
    );
    if ((g.motor ?? 1) === 2) {
      const vivo = calcularCustoMotor2(
        g.inputs,
        g.oper as ParametrosMotor2,
        tributos,
      );
      expect({
        motor: vivo.motor,
        material: vivo.material,
        mao_de_obra: vivo.mao_de_obra,
        margem: vivo.margem,
        alertas: vivo.alertas,
        parcelas: vivo.parcelas,
        resultado: vivo.resultado,
        fundamentos: vivo.fundamentos,
      }).toEqual(g.esperado);
      return;
    }
    const vivo = calcularCustoFiscal(
      g.inputs as InputsFiscal,
      g.oper as ParametrosOperacionaisFiscal,
      tributos,
    );
    expect({
      material: vivo.material,
      mao_de_obra: vivo.mao_de_obra,
      parcelas: vivo.parcelas,
      resultado: vivo.resultado,
      fundamentos: vivo.fundamentos,
    }).toEqual(g.esperado);
  });
});
