import * as React from 'react';
import { useAuth, type Role } from '@/auth/auth-context';

/**
 * Acoes de escrita por tela. Espelha os @Roles(...) dos controllers do backend.
 * '*' = qualquer usuario autenticado.
 */
export type Acao =
  | 'embalagem:escrever'
  | 'embalagem:atualizar-preco'
  | 'mp:escrever'
  | 'mp:atualizar-preco'
  | 'cliente:escrever'
  | 'cliente:remover'
  | 'formula:ler'
  | 'formula:escrever'
  | 'match-formulas';

const PERMISSOES: Record<Acao, Role[] | '*'> = {
  'embalagem:escrever': ['admin', 'compras', 'comercial'],
  'embalagem:atualizar-preco': ['admin', 'compras', 'comercial'],
  'mp:escrever': ['admin', 'compras', 'pd'],
  'mp:atualizar-preco': '*',
  'cliente:escrever': ['admin', 'comercial'],
  'cliente:remover': ['admin'],
  'formula:ler': '*',
  'formula:escrever': ['admin', 'pd'],
  'match-formulas': ['admin', 'comercial', 'pd'],
};

/** Retorna `can(acao)` para esconder/desabilitar botoes conforme a role do usuario. */
export function useCan() {
  const { user } = useAuth();
  return React.useCallback(
    (acao: Acao) => {
      if (!user) return false;
      const regra = PERMISSOES[acao];
      return regra === '*' || regra.includes(user.role);
    },
    [user],
  );
}
