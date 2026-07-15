import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PendenciasLabService } from './pendencias-lab.service';
import { CreatePendenciaDto } from './dto/create-pendencia.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * Jornada de Laboratório (fatia 1). Fila PÚBLICA (D1): criar e listar = qualquer
 * autenticado (guards globais Jwt). Atender/Concluir = pd|admin (o lab).
 * Rotas estáticas antes de :id (regra 9).
 */
@Controller('pendencias-lab')
export class PendenciasLabController {
  constructor(private readonly pendencias: PendenciasLabService) {}

  @Get()
  listar(@Query('status') status?: string) {
    return this.pendencias.listar(status);
  }

  @Get('contagem')
  contagem() {
    return this.pendencias.contarAbertas();
  }

  @Post()
  @HttpCode(201)
  criar(@Body() dto: CreatePendenciaDto, @CurrentUser('sub') userId: string) {
    return this.pendencias.criar(dto, userId);
  }

  @Post(':id/atender')
  @HttpCode(200)
  @Roles(Role.pd, Role.admin)
  atender(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: string) {
    return this.pendencias.atender(id, userId);
  }

  // Correção A: concluir NÃO recebe fórmula — conclui a VINCULADA (do atender).
  @Post(':id/concluir')
  @HttpCode(200)
  @Roles(Role.pd, Role.admin)
  concluir(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: string) {
    return this.pendencias.concluir(id, userId);
  }
}
