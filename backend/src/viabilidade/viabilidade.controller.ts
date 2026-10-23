import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ViabilidadeService } from './viabilidade.service';
import { CalcularViabilidadeDto } from './dto/calcular-viabilidade.dto';
import { CreateProjetoViabilidadeDto } from './dto/create-projeto-viabilidade.dto';
import { UpdateProjetoViabilidadeDto } from './dto/update-projeto-viabilidade.dto';
import { AcessoCustoGuard } from '../auth/guards/acesso-custo.guard';
import { RequerAcessoCusto } from '../auth/decorators/requer-acesso-custo.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Análise de viabilidade de projetos (Matriz de Custo, 10/26). Mesmo gate da
 * Matriz: admin OU pode_ver_custos (AcessoCustoGuard, lookup no banco a cada
 * request). Rotas ESTÁTICAS antes de :id (regra 9). DELETE só admin
 * (RolesGuard global). Criar/alterar/calcular/excluir vão para o audit_log.
 */
@Controller('viabilidade')
@UseGuards(AcessoCustoGuard)
@RequerAcessoCusto()
export class ViabilidadeController {
  constructor(private readonly viabilidade: ViabilidadeService) {}

  @Get()
  listar() {
    return this.viabilidade.listar();
  }

  /** parâmetros vigentes + NCMs ativas + clientes com perfil (preenche o formulário). */
  @Get('contexto')
  contexto() {
    return this.viabilidade.contexto();
  }

  /** só calcula — não grava nada. */
  @Post('calcular')
  calcular(@Body() dto: CalcularViabilidadeDto) {
    return this.viabilidade.calcular(dto.premissas);
  }

  /** cria e já calcula. */
  @Post()
  criar(@Body() dto: CreateProjetoViabilidadeDto, @CurrentUser('sub') userId: string) {
    return this.viabilidade.criar(dto, userId);
  }

  // ---------------------------- rotas :id ----------------------------

  @Get(':id')
  obter(@Param('id', ParseIntPipe) id: number) {
    return this.viabilidade.obter(id);
  }

  @Patch(':id')
  atualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjetoViabilidadeDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.viabilidade.atualizar(id, dto, userId);
  }

  @Post(':id/calcular')
  recalcular(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: string) {
    return this.viabilidade.recalcular(id, userId);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remover(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: string) {
    return this.viabilidade.remover(id, userId);
  }
}
