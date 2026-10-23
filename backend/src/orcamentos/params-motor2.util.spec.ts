/**
 * Specs da leitura dos parâmetros do Motor 2 e da seleção do motor — com um
 * Prisma FALSO (sem banco). Cobre: falha visível quando falta chave, seleção
 * da vigência mais recente, seletor do motor e rastreabilidade das vigências.
 */
import type { PrismaService } from '../prisma/prisma.service';
import { lerMotorPadrao, lerParametrosMotor2 } from './params-motor2.util';
import { normalizarCustoComposicao } from './calculo.service';

type Row = {
  chave: string;
  valor: number;
  vigencia_inicio: Date;
  vigencia_fim: Date | null;
  fonte?: string;
  fundamento_legal?: string;
};

function fakePrisma(producao: Row[], fiscal: Row[]): PrismaService {
  // a query real filtra por vigência; aqui filtramos no fake pelo mesmo critério
  const vig = (rows: Row[], hoje: Date) =>
    rows
      .filter(
        (r) =>
          r.vigencia_inicio <= hoje &&
          (r.vigencia_fim === null || r.vigencia_fim >= hoje),
      )
      .sort(
        (a, b) => b.vigencia_inicio.getTime() - a.vigencia_inicio.getTime(),
      );
  type Args = { where: { vigencia_inicio: { lte: Date } } };
  return {
    parametroProducao: {
      findMany: ({ where }: Args) =>
        Promise.resolve(vig(producao, where.vigencia_inicio.lte)),
      // historico da chave (lerMotorPadrao: chave com historico sem vigencia => lanca)
      count: ({ where }: { where: { chave: string; vigencia_inicio: { lte: Date } } }) =>
        Promise.resolve(
          producao.filter((r) => r.chave === where.chave && r.vigencia_inicio <= where.vigencia_inicio.lte).length,
        ),
    },
    parametroFiscal: {
      findMany: ({ where }: Args) =>
        Promise.resolve(vig(fiscal, where.vigencia_inicio.lte)),
    },
  } as unknown as PrismaService;
}

const row = (
  chave: string,
  valor: number,
  inicio: string,
  fim: string | null = null,
): Row => ({
  chave,
  valor,
  vigencia_inicio: new Date(inicio),
  vigencia_fim: fim ? new Date(fim) : null,
  fonte: `fonte ${chave}`,
  fundamento_legal: `fund ${chave}`,
});

const PRODUCAO = {
  custo_fixo_producao_mensal: 101305,
  linhas_paralelas: 2.5,
  eficiencia_producao: 0.82,
  setup_minutos: 60,
  dias_uteis_mes: 22,
  horas_dia: 8,
  moq_economico_valor: 2400,
};

const politica2026 = [
  row('taxa_gestao_embalagem_pct', 15, '2026-10-01'),
  row('margem_lote_pequeno_pct', 45, '2026-10-01'),
  row('margem_lote_medio_pct', 40, '2026-10-01'),
  row('margem_lote_grande_pct', 35, '2026-10-01'),
  row('lote_medio_min_un', 1000, '2026-10-01'),
  row('lote_grande_min_un', 5000, '2026-10-01'),
  row('lote_minimo_un', 500, '2026-10-01'),
  row('un_min_padrao', 6, '2026-10-01'),
];
const creditos2026 = [
  row('credito_mp_pct', 21.21, '2026-10-01'),
  row('credito_emb_pct', 13.82, '2026-10-01'),
];
const HOJE = new Date('2026-10-20');

describe('lerMotorPadrao', () => {
  it('sem seletor cadastrado => Motor 1 (comportamento anterior preservado)', async () => {
    expect(await lerMotorPadrao(fakePrisma([], []), HOJE)).toBe(1);
  });
  it('motor_precificacao = 2 vigente => Motor 2; vigência futura não conta', async () => {
    expect(
      await lerMotorPadrao(
        fakePrisma([row('motor_precificacao', 2, '2026-10-01')], []),
        HOJE,
      ),
    ).toBe(2);
    expect(
      await lerMotorPadrao(
        fakePrisma([row('motor_precificacao', 2, '2027-01-01')], []),
        HOJE,
      ),
    ).toBe(1);
  });
  it('vigência mais recente vence (volta para 1 em emergência)', async () => {
    const rows = [
      row('motor_precificacao', 2, '2026-10-01', '2026-10-14'),
      row('motor_precificacao', 1, '2026-10-15'),
    ];
    expect(await lerMotorPadrao(fakePrisma(rows, []), HOJE)).toBe(1);
  });

  it('chave com historico mas SEM vigencia ativa hoje => lanca (red team C2: nunca Motor 1 em silencio)', async () => {
    const encerrada = { ...row('motor_precificacao', 2, '2026-10-01'), vigencia_fim: new Date('2026-10-15') };
    await expect(lerMotorPadrao(fakePrisma([encerrada], []), HOJE)).rejects.toThrow(/nenhuma vigencia ativa/);
  });

  it('valor fora de {1,2} => lanca (red team M2)', async () => {
    await expect(
      lerMotorPadrao(fakePrisma([row('motor_precificacao', 3, '2026-10-01')], []), HOJE),
    ).rejects.toThrow(/invalido/);
  });
});

describe('lerParametrosMotor2', () => {
  const legado = { perda_mp_pct: 10, frete_un_brl: 0.1 };

  it('monta ParametrosMotor2 e lista as vigências usadas (rastreabilidade)', async () => {
    const r = await lerParametrosMotor2(
      fakePrisma(politica2026, creditos2026),
      PRODUCAO,
      legado,
      HOJE,
    );
    expect(r.params.credito_mp_pct).toBe(21.21);
    expect(r.params.credito_emb_pct).toBe(13.82);
    expect(r.params.taxa_gestao_embalagem_pct).toBe(15);
    expect(r.params.escada).toEqual({
      lote_pequeno_pct: 45,
      lote_medio_pct: 40,
      lote_grande_pct: 35,
      lote_medio_min_un: 1000,
      lote_grande_min_un: 5000,
    });
    expect(r.params.lote_minimo_un).toBe(500);
    expect(r.params.perda_mp_pct).toBe(10);
    expect(r.un_min_padrao).toBe(6);
    const chaves = r.vigencias.map((v) => v.chave);
    expect(chaves).toEqual(
      expect.arrayContaining([
        'credito_mp_pct',
        'lote_minimo_un',
        'un_min_padrao',
      ]),
    );
    expect(r.vigencias[0]).toMatchObject({
      vigencia_inicio: '2026-10-01',
      fonte: 'fund credito_mp_pct',
    });
  });

  it('FALHA VISÍVEL: lista exatamente o que falta, por tabela', async () => {
    const semCreditos = lerParametrosMotor2(
      fakePrisma(politica2026, []),
      PRODUCAO,
      legado,
      HOJE,
    );
    await expect(semCreditos).rejects.toThrow(
      /parametro_fiscal\.credito_mp_pct, parametro_fiscal\.credito_emb_pct/,
    );
    const semLote = lerParametrosMotor2(
      fakePrisma(
        politica2026.filter((r) => r.chave !== 'lote_minimo_un'),
        creditos2026,
      ),
      PRODUCAO,
      legado,
      HOJE,
    );
    await expect(semLote).rejects.toThrow(/parametro_producao\.lote_minimo_un/);
  });

  it('un_min_padrao é OPCIONAL: ausente => null (serviço então exige un_min)', async () => {
    const r = await lerParametrosMotor2(
      fakePrisma(
        politica2026.filter((x) => x.chave !== 'un_min_padrao'),
        creditos2026,
      ),
      PRODUCAO,
      legado,
      HOJE,
    );
    expect(r.un_min_padrao).toBeNull();
  });
});

describe('normalizarCustoComposicao (pente fino: composição ≠ 100%)', () => {
  it('dentro da tolerância (±0,5 p.p.): custo inalterado, sem alerta', () => {
    expect(normalizarCustoComposicao(50, [60, 39.8])).toEqual({
      custo_mp_kg: 50,
      composicao_normalizada: null,
    });
  });
  it('soma 80%: custo × 100/80 e alerta com soma, fator e bruto', () => {
    const r = normalizarCustoComposicao(40, [50, 30]);
    expect(r.custo_mp_kg).toBeCloseTo(50, 6);
    expect(r.composicao_normalizada).toEqual({
      soma_pct: 80,
      fator: 1.25,
      custo_mp_kg_bruto: 40,
    });
  });
  it('soma 0 (composição vazia/sem concentrações): não divide por zero', () => {
    expect(normalizarCustoComposicao(0, [])).toEqual({
      custo_mp_kg: 0,
      composicao_normalizada: null,
    });
  });
});
