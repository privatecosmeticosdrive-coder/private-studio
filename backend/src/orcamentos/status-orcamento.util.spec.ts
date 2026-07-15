/** Specs da máquina de status do orçamento (P1). */
import { validarTransicao } from './status-orcamento.util';

describe('validarTransicao — máquina de status do orçamento', () => {
  it('rascunho -> enviado exige cálculo', () => {
    expect(validarTransicao('rascunho', 'enviado', true).ok).toBe(true);
    const sem = validarTransicao('rascunho', 'enviado', false);
    expect(sem.ok).toBe(false);
    expect(sem.erro).toMatch(/Calcule/);
  });

  it('enviado -> aprovado_cliente / recusado', () => {
    expect(validarTransicao('enviado', 'aprovado_cliente', true).ok).toBe(true);
    expect(validarTransicao('enviado', 'recusado', true).ok).toBe(true);
  });

  it('não pula etapas: rascunho -> aprovado_cliente/recusado rejeitado', () => {
    expect(validarTransicao('rascunho', 'aprovado_cliente', true).ok).toBe(false);
    expect(validarTransicao('rascunho', 'recusado', true).ok).toBe(false);
  });

  it('estados finais não transicionam', () => {
    expect(validarTransicao('aprovado_cliente', 'enviado', true).ok).toBe(false);
    expect(validarTransicao('recusado', 'enviado', true).ok).toBe(false);
  });

  it('não volta: enviado -> rascunho rejeitado', () => {
    expect(validarTransicao('enviado', 'rascunho', true).ok).toBe(false);
  });

  it('status desconhecido rejeitado', () => {
    expect(validarTransicao('aprovado_interno', 'enviado', true).ok).toBe(false);
  });
});
