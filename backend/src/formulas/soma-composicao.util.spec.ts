/** Specs do save parcial × validação (P0-1): a faixa só trava a VALIDAÇÃO. */
import { somaComposicao, somaValidaParaValidacao } from './soma-composicao.util';

describe('somaComposicao', () => {
  it('soma ignorando nulos/NaN', () => {
    expect(somaComposicao([50, 30, null, undefined, 20])).toBe(100);
    expect(somaComposicao([Number.NaN, 40])).toBe(40);
    expect(somaComposicao([])).toBe(0);
  });
});

describe('somaValidaParaValidacao (faixa 99,5–100,5)', () => {
  it('aceita a faixa', () => {
    expect(somaValidaParaValidacao(99.5)).toBe(true);
    expect(somaValidaParaValidacao(100)).toBe(true);
    expect(somaValidaParaValidacao(100.5)).toBe(true);
  });
  it('rejeita fora — fórmula 50% não é validável', () => {
    expect(somaValidaParaValidacao(50)).toBe(false);
    expect(somaValidaParaValidacao(99.49)).toBe(false);
    expect(somaValidaParaValidacao(100.51)).toBe(false);
    expect(somaValidaParaValidacao(0)).toBe(false);
  });
});
