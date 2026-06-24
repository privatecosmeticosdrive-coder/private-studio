import { SetMetadata } from '@nestjs/common';

/** Marca a rota como exigindo acesso a custos (checado pelo AcessoCustoGuard). */
export const ACESSO_CUSTO_KEY = 'requer_acesso_custo';
export const RequerAcessoCusto = () => SetMetadata(ACESSO_CUSTO_KEY, true);
