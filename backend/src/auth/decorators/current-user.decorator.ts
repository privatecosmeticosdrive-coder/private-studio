import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtUser {
  sub: string; // user id
  email: string;
  role: string;
  nome: string;
}

/** Injeta o usuario autenticado (payload do JWT) no parametro do handler. */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext): JwtUser | unknown => {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as JwtUser;
    return data ? user?.[data] : user;
  },
);
