import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AcessoCusto {
  role: string;
  pode_ver_custos: boolean;
}

/** Injeta a permissão de custo anexada pelo AcessoCustoGuard (lida do banco). */
export const AcessoCusto = createParamDecorator(
  (data: keyof AcessoCusto | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const acesso = req.acessoCusto as AcessoCusto | undefined;
    return data ? acesso?.[data] : acesso;
  },
);
