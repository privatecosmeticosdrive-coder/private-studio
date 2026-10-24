import { SetMetadata } from '@nestjs/common';

/** Marca a rota como exigindo acesso a custos (checado pelo AcessoCustoGuard). */
export const ACESSO_CUSTO_KEY = 'requer_acesso_custo';
export const RequerAcessoCusto = () => SetMetadata(ACESSO_CUSTO_KEY, true);

/**
 * Exceção numa rota de controller marcado com @RequerAcessoCusto(): o guard lê
 * o handler antes da classe (getAllAndOverride), então `false` aqui libera a
 * rota para qualquer usuário logado. Só para leitura sem custo nem margem.
 */
export const SemAcessoCusto = () => SetMetadata(ACESSO_CUSTO_KEY, false);
