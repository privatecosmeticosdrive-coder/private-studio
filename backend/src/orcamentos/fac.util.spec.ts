import { aplicarAjusteFac, montarAjusteFac, type ItemBaseFac } from './fac.util';

const base: ItemBaseFac[] = [
  { mp_id: 1, nome: 'Agua', concentracao_pct: 80 },
  { mp_id: 2, nome: 'Glicerina', concentracao_pct: 5 },
  { mp_id: 3, nome: 'Ativo A', concentracao_pct: 2 },
  { mp_id: 4, nome: 'Conservante', concentracao_pct: 0.5 },
  { mp_id: 5, nome: 'Espessante', concentracao_pct: 12.5 },
];
const nomes = new Map([[9, 'Ativo novo'], [10, 'Outro'], [11, 'Mais um']]);

describe('FAC — formula ajustada pelo comercial', () => {
  it('alterar um ativo compensa no maior item livre (agua) e soma continua 100', () => {
    const a = montarAjusteFac(base, [{ mp_id: 3, acao: 'alterar', para_pct: 4 }], nomes);
    expect(a.delta_total_pct).toBe(2);
    expect(a.compensacao).toEqual({ mp_id: 1, nome: 'Agua', de_pct: 80, para_pct: 78 });
    const linhas = aplicarAjusteFac(base, a, (i) => ({ mp_id: i.mp_id, nome: i.nome, concentracao_pct: 0 }));
    expect(linhas.reduce((s, l) => s + l.concentracao_pct, 0)).toBeCloseTo(100, 6);
    expect(linhas.find((l) => l.mp_id === 3)?.fac).toBe('alterar');
    expect(linhas.find((l) => l.mp_id === 1)?.fac).toBe('compensacao');
  });

  it('adicionar e remover entram nos limites; remover devolve o percentual ao veiculo', () => {
    const a = montarAjusteFac(
      base,
      [
        { mp_id: 9, acao: 'adicionar', para_pct: 1 },
        { mp_id: 4, acao: 'remover' },
      ],
      nomes,
    );
    expect(a.delta_total_pct).toBe(1.5);
    expect(a.compensacao?.para_pct).toBe(79.5);
    const linhas = aplicarAjusteFac(base, a, (i) => ({ mp_id: i.mp_id, nome: i.nome, concentracao_pct: 0 }));
    expect(linhas.some((l) => l.mp_id === 4)).toBe(false);
    expect(linhas.find((l) => l.mp_id === 9)).toMatchObject({ concentracao_pct: 1, fac: 'adicionar' });
    expect(linhas.reduce((s, l) => s + l.concentracao_pct, 0)).toBeCloseTo(100, 6);
  });

  it('bloqueia mais de 5 itens', () => {
    const pedido = [1, 2, 3, 4, 5, 9].map((mp_id) => ({ mp_id, acao: 'alterar' as const, para_pct: 1 }));
    expect(() => montarAjusteFac(base, pedido, nomes)).toThrow(/no maximo 5 itens/);
  });

  it('bloqueia variacao acima de 5 pontos percentuais', () => {
    expect(() =>
      montarAjusteFac(base, [{ mp_id: 2, acao: 'alterar', para_pct: 10.5 }], nomes),
    ).toThrow(/limite do comercial e 5/);
  });

  it('5 pontos exatos passa (limite inclusivo)', () => {
    expect(montarAjusteFac(base, [{ mp_id: 2, acao: 'alterar', para_pct: 10 }], nomes).delta_total_pct).toBe(5);
  });

  it('recusa acao incoerente com a formula', () => {
    expect(() => montarAjusteFac(base, [{ mp_id: 2, acao: 'adicionar', para_pct: 1 }], nomes)).toThrow(/ja esta na formula/);
    expect(() => montarAjusteFac(base, [{ mp_id: 9, acao: 'alterar', para_pct: 1 }], nomes)).toThrow(/use adicionar/);
    expect(() => montarAjusteFac(base, [{ mp_id: 2, acao: 'alterar', para_pct: 5 }], nomes)).toThrow(/ja esta em 5%/);
    expect(() => montarAjusteFac(base, [{ mp_id: 2, acao: 'alterar', para_pct: 0 }], nomes)).toThrow(/use remover/);
  });

  it('sem ajuste, aplicar devolve a base intacta', () => {
    const linhas = aplicarAjusteFac(base, null, () => ({ mp_id: 0, nome: '', concentracao_pct: 0 }));
    expect(linhas).toEqual(base);
  });
});
