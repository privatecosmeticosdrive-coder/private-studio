/* eslint-disable no-console */
// ============================================================================
// GERADOR DOS GOLDENS DO MOTOR 2 10/26 — SEM BANCO. Os 5 casos são os
// exemplos de referência validados pelo dono e pela auditoria financeira de
// 19–20/10/2026 (docs/precificacao/MOTOR-2-10-26.md). O spec
// custo-engine.golden.spec.ts recomputa cada um com tolerância zero.
//
// Regerar SÓ quando o Motor 2 mudar deliberadamente (nova vigência não exige
// regerar: os goldens congelam os parâmetros DENTRO do arquivo).
//
// USO: npx ts-node --transpile-only -P prisma/tsconfig.json prisma/gerar-goldens-motor2.ts
// ============================================================================
import * as fs from 'fs';
import * as path from 'path';
import { calcularCustoMotor2, type InputsMotor2, type ParametrosMotor2 } from '../src/orcamentos/custo-engine-motor2';
import { resolverTributosSaida, type NcmFiscal, type PerfilClienteFiscal } from '../src/orcamentos/matriz-fiscal.util';

const GOLDENS_DIR = path.join(__dirname, '..', 'test', 'goldens');

const oper: ParametrosMotor2 = {
  producao: {
    custo_fixo_producao_mensal: 101305,
    linhas_paralelas: 2.5,
    eficiencia_producao: 0.82,
    setup_minutos: 60,
    dias_uteis_mes: 22,
    horas_dia: 8,
    moq_economico_valor: 2400,
  },
  perda_mp_pct: 10,
  frete_un_brl: 0.1,
  credito_mp_pct: 21.21,
  credito_emb_pct: 13.82,
  taxa_gestao_embalagem_pct: 15,
  escada: {
    lote_pequeno_pct: 45,
    lote_medio_pct: 40,
    lote_grande_pct: 35,
    lote_medio_min_un: 1000,
    lote_grande_min_un: 5000,
  },
  lote_minimo_un: 500,
};

const params = {
  pis_monofasico_pct: 2.2,
  cofins_monofasico_pct: 10.3,
  pis_comum_pct: 1.65,
  cofins_comum_pct: 7.6,
  icms_carga_art34_pct: 12,
  icms_nominal_padrao_pct: 18,
};
const perfil: PerfilClienteFiscal = {
  regime_fiscal: 'lucro_real_presumido',
  finalidade: 'revenda',
  uf: 'SP',
  contribuinte_icms: true,
};
const ncm: NcmFiscal = {
  ncm: '3305.90.00',
  ex_tipi: '',
  ipi_pct: 0,
  monofasico: true,
  tratamento: 'aliquota_zero',
  icms_nominal_pct: null,
};
const caracterizacao = { industrializacao_caracterizada: false };

const kgDeUn = (mp_un: number, volume_ml: number) => Number(((mp_un * 1000) / volume_ml).toFixed(6));

const CASOS: { arquivo: string; fonte: string; inputs: InputsMotor2; preco_ref: number }[] = [
  {
    arquivo: 'motor2-finalizador-50ml-lote1000-emb.json',
    fonte: 'Finalizador capilar óleo vegetal 50 ml — MP última compra R$ 5,5694/un, embalagem R$ 6,00, lote 1.000 (escada 40%) → R$ 25,41 sem IPI',
    inputs: { cmp_base_mp_kg: kgDeUn(5.5694, 50), volume_un: 50, quantidade: 1000, un_min: 6, embalagem_un: 6, mp_sem_preco: [] },
    preco_ref: 25.41,
  },
  {
    arquivo: 'motor2-leavein-150ml-lote1000-emb.json',
    fonte: 'Leave-in bruma 150 ml — MP última compra R$ 8,632/un, embalagem R$ 14,96, lote 1.000 (escada 40%) → R$ 45,65 sem IPI',
    inputs: { cmp_base_mp_kg: kgDeUn(8.632, 150), volume_un: 150, quantidade: 1000, un_min: 6, embalagem_un: 14.96, mp_sem_preco: [] },
    preco_ref: 45.65,
  },
  {
    arquivo: 'motor2-finalizador-50ml-lote300-sem-emb.json',
    fonte: 'Finalizador sem embalagem, lote 300 (escada 45%, ABAIXO do lote mínimo 500) → R$ 21,78 sem IPI',
    inputs: { cmp_base_mp_kg: kgDeUn(5.5694, 50), volume_un: 50, quantidade: 300, un_min: 6, embalagem_un: 0, mp_sem_preco: [] },
    preco_ref: 21.78,
  },
  {
    arquivo: 'motor2-finalizador-50ml-lote500-sem-emb.json',
    fonte: 'Finalizador sem embalagem, lote 500 (escada 45%) → R$ 20,55 sem IPI',
    inputs: { cmp_base_mp_kg: kgDeUn(5.5694, 50), volume_un: 50, quantidade: 500, un_min: 6, embalagem_un: 0, mp_sem_preco: [] },
    preco_ref: 20.55,
  },
  {
    arquivo: 'motor2-finalizador-50ml-lote5000-sem-emb.json',
    fonte: 'Finalizador sem embalagem, lote 5.000 (escada 35%) → R$ 14,23 sem IPI',
    inputs: { cmp_base_mp_kg: kgDeUn(5.5694, 50), volume_un: 50, quantidade: 5000, un_min: 6, embalagem_un: 0, mp_sem_preco: [] },
    preco_ref: 14.23,
  },
];

for (const c of CASOS) {
  const tributos = resolverTributosSaida('full_service', perfil, ncm, params, caracterizacao);
  const r = calcularCustoMotor2(c.inputs, oper, tributos);
  if (r.resultado.preco_sipi !== c.preco_ref) {
    throw new Error(`${c.arquivo}: preço ${r.resultado.preco_sipi} ≠ referência ${c.preco_ref}`);
  }
  const golden = {
    _fonte: `${c.fonte} — Motor 2 10/26 (auditoria 19–20/10/2026)`,
    motor: 2,
    modo_operacao: 'full_service',
    inputs: c.inputs,
    oper,
    perfil,
    ncm,
    params,
    caracterizacao,
    esperado: {
      motor: r.motor,
      material: r.material,
      mao_de_obra: r.mao_de_obra,
      margem: r.margem,
      alertas: r.alertas,
      parcelas: r.parcelas,
      resultado: r.resultado,
      fundamentos: r.fundamentos,
    },
  };
  fs.writeFileSync(path.join(GOLDENS_DIR, c.arquivo), JSON.stringify(golden, null, 2) + '\n');
  console.log(`${c.arquivo} -> sipi ${r.resultado.preco_sipi} (ref ${c.preco_ref}) cipi ${r.resultado.preco_cipi}`);
}
