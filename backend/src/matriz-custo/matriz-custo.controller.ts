import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MatrizCustoService } from './matriz-custo.service';
import { UpdateOperacionalDto } from './dto/update-operacional.dto';
import { UpdateFiscalDto } from './dto/update-fiscal.dto';
import { CreateNcmDto } from './dto/create-ncm.dto';
import { UpdateNcmDto } from './dto/update-ncm.dto';
import { CreateParametroFiscalDto } from './dto/create-parametro-fiscal.dto';
import { AcessoCustoGuard } from '../auth/guards/acesso-custo.guard';
import { RequerAcessoCusto } from '../auth/decorators/requer-acesso-custo.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AcessoCusto } from '../auth/decorators/acesso-custo.decorator';

/**
 * Matriz de Custo (backend F3). Acesso: admin OU pode_ver_custos (ver E editar),
 * via AcessoCustoGuard (lookup no banco a cada request). Roda apos os guards
 * globais (Jwt + Roles). Todo PATCH/POST/DELETE loga em matriz_custo_historico
 * com o user_id real do editor.
 */
@Controller('matriz-custo')
@UseGuards(AcessoCustoGuard)
@RequerAcessoCusto()
export class MatrizCustoController {
  constructor(private readonly matriz: MatrizCustoService) {}

  @Get()
  get() {
    return this.matriz.get();
  }

  @Patch('operacional')
  updateOperacional(@Body() dto: UpdateOperacionalDto, @CurrentUser('sub') userId: string) {
    return this.matriz.updateOperacional(dto, userId);
  }

  @Patch('fiscal')
  updateFiscal(
    @Body() dto: UpdateFiscalDto,
    @CurrentUser('sub') userId: string,
    @AcessoCusto('role') role: string,
  ) {
    return this.matriz.updateFiscal(dto, userId, role);
  }

  // ---- parametros fiscais versionados (F4 Fase A) — estaticas ANTES de ncm/:id ----
  @Get('parametros-fiscais')
  listParametrosFiscais() {
    return this.matriz.listParametrosFiscais();
  }

  @Post('parametros-fiscais')
  createParametroFiscal(
    @Body() dto: CreateParametroFiscalDto,
    @CurrentUser('sub') userId: string,
    @AcessoCusto('role') role: string,
  ) {
    return this.matriz.createParametroFiscal(dto, userId, role);
  }

  @Get('ncm')
  listNcm(@Query('incluirInativas') incluirInativas?: string) {
    return this.matriz.listNcm(incluirInativas === 'true');
  }

  @Post('ncm')
  createNcm(@Body() dto: CreateNcmDto, @CurrentUser('sub') userId: string) {
    return this.matriz.createNcm(dto, userId);
  }

  @Patch('ncm/:id')
  updateNcm(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNcmDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.matriz.updateNcm(id, dto, userId);
  }

  @Delete('ncm/:id')
  removeNcm(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: string) {
    return this.matriz.removeNcm(id, userId);
  }

  @Get('historico')
  historico(
    @Query('entidade') entidade?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.matriz.historicoLista({
      entidade,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
