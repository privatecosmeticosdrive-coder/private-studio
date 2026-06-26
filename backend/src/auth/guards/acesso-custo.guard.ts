import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ACESSO_CUSTO_KEY } from '../decorators/requer-acesso-custo.decorator';

/**
 * Guard de acesso a custos. Roda APOS o JwtAuthGuard global (que ja populou
 * req.user a partir do JWT). So enforça nas rotas marcadas com
 * @RequerAcessoCusto() — sem a marca, libera (padrao do RolesGuard).
 *
 * CRITICO: a permissao e lida do BANCO a cada request (NUNCA do JWT), por
 * req.user.sub, para revogacao imediata (pode_ver_custos/ativo sao dados
 * sensiveis e nao podem esperar o token expirar).
 *
 * Libera se: usuario existe && ativo && (role admin OU pode_ver_custos=true).
 */
@Injectable()
export class AcessoCustoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const requer = this.reflector.getAllAndOverride<boolean>(ACESSO_CUSTO_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!requer) return true; // rota sem @RequerAcessoCusto => nao enforça

    const req = ctx.switchToHttp().getRequest();
    const sub = req.user?.sub;
    if (!sub) throw new ForbiddenException('Acesso restrito a custos');

    // LOOKUP NO BANCO (nunca do JWT) — revogacao imediata.
    const user = await this.prisma.user.findUnique({
      where: { id: sub },
      select: { role: true, pode_ver_custos: true, ativo: true },
    });

    const liberado =
      !!user &&
      user.ativo &&
      (user.role === Role.admin || user.pode_ver_custos === true);

    if (!liberado) throw new ForbiddenException('Acesso restrito a custos');

    // Anexa a permissão (do BANCO) ao request para regras de campo a jusante
    // (ex.: só admin altera fiscais_provisorios). Mesma fonte autoritativa,
    // sem segundo hit no banco.
    req.acessoCusto = { role: user!.role, pode_ver_custos: user!.pode_ver_custos };
    return true;
  }
}
