/** Specs do score de material (MP + embalagem ponderados). */
import { scoreMaterialPonderado, scoreCotacao, faixaScore } from './score.util';

describe('scoreMaterialPonderado', () => {
  it('reproduz o caso #76: embalagem domina o custo e puxa o score', () => {
    // custo material/un = 0,6505 MP+desvio+frete ... na prática: MP 0,0591*... —
    // usamos as participações medidas: MP 6,1% / embalagem 93,9%.
    const s = scoreMaterialPonderado(62.5, 0.061, 50, 0.939);
    expect(s).toBe(51); // 0,061×62,5 + 0,939×50 = 50,8 -> 51
  });

  it('embalagem em dia (98) puxa o score PARA CIMA na mesma proporção', () => {
    const s = scoreMaterialPonderado(62.5, 0.061, 98, 0.939);
    expect(s).toBe(96); // dominância funciona nos dois sentidos
  });

  it('sem embalagem: devolve o score de MP puro, sem diluir', () => {
    expect(scoreMaterialPonderado(74, 1.5, null, 0)).toBe(74);
    expect(scoreMaterialPonderado(74, 1.5, 98, 0)).toBe(74); // custo zero não pondera
  });

  it('embalagem irrelevante no custo quase não move o score', () => {
    const s = scoreMaterialPonderado(90, 9.9, 50, 0.1);
    expect(s).toBe(90); // 0,4 de queda -> arredonda de volta
  });

  it('custo total zero não quebra (devolve o de MP)', () => {
    expect(scoreMaterialPonderado(55, 0, 98, 0)).toBe(55);
  });
});

describe('scoreCotacao — régua de idade (base do fallback)', () => {
  it('sem data pontua 50', () => {
    expect(scoreCotacao(null)).toBe(50);
    expect(scoreCotacao(undefined)).toBe(50);
  });
  it('cotação de hoje pontua 98', () => {
    expect(scoreCotacao(new Date())).toBe(98);
  });
  it('faixa do #76 (51) é vermelho', () => {
    expect(faixaScore(51)).toBe('vermelho');
  });
});
