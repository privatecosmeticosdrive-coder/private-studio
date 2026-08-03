/** Specs da máquina de status do orçamento (P1). */
import { validarTransicao } from './status-orcamento.util';

describe('validarTransicao — máquina de status do orçamento', () => {
  it('rascunho -> enviado exige cálculo', () => {
    expect(validarTransicao('rascunho', 'enviado', true).ok).toBe(true);
    const sem = validarTransicao('rascunho', 'enviado', false);
    expect(sem.ok).toBe(false);
    expect(sem.erro).toMatch(/Calcule/);
  });

  it('enviado -> aprovado_cliente (sem motivo — aprovar não pede nada)', () => {
    expect(validarTransicao('enviado', 'aprovado_cliente', true).ok).toBe(true);
  });

  // FASE 3 — a regra desta transição MUDOU: antes `enviado -> recusado` passava
  // sem motivo. Agora o motivo categorizado é obrigatório (captura do dado).
  it('enviado -> recusado EXIGE motivo categorizado', () => {
    const sem = validarTransicao('enviado', 'recusado', true);
    expect(sem.ok).toBe(false);
    expect(sem.erro).toMatch(/motivo/i);

    const vazio = validarTransicao('enviado', 'recusado', true, '');
    expect(vazio.ok).toBe(false);
  });

  it('enviado -> recusado aceita os 4 motivos válidos', () => {
    for (const m of ['preco_custo', 'formula', 'prazo', 'outro']) {
      expect(validarTransicao('enviado', 'recusado', true, m).ok).toBe(true);
    }
  });

  it('enviado -> recusado rejeita motivo fora da lista', () => {
    const r = validarTransicao('enviado', 'recusado', true, 'custo_formula');
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/invalido/i);
  });

  it('motivo não vaza para outras transições (aprovar ignora)', () => {
    expect(validarTransicao('enviado', 'aprovado_cliente', true, 'formula').ok).toBe(true);
    // transição inválida continua inválida mesmo com motivo bom
    expect(validarTransicao('rascunho', 'recusado', true, 'formula').ok).toBe(false);
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
