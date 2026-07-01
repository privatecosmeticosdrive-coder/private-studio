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
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { FormulasService } from './formulas.service';
import { CreateFormulaDto } from './dto/create-formula.dto';
import { UpdateFormulaDto } from './dto/update-formula.dto';
import { NovaVersaoDto } from './dto/nova-versao.dto';
import { ValidarFormulaDto } from './dto/validar-formula.dto';
import { RevisarNcmDto } from './dto/revisar-ncm.dto';
import { SugerirSimilarDto } from './dto/sugerir-similar.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';

@Controller('formulas')
export class FormulasController {
  constructor(private readonly formulas: FormulasService) {}

  // --- rotas estaticas ANTES das rotas com :id ---
  @Get('buscar')
  buscar(@Query('q') q: string) {
    return this.formulas.buscar(q ?? '');
  }

  @Post('sugerir-similar')
  sugerirSimilar(@Body() dto: SugerirSimilarDto) {
    return this.formulas.sugerirSimilar(dto);
  }

  // Fila de revisao da associacao formula->NCM (F5 Bloco C) — as 274 pendentes.
  @Get('pendentes-ncm')
  pendentesNcm(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.formulas.pendentesNcm({
      q,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('categoria') categoria?: string,
    @Query('origem') origem?: string,
    @Query('status') status?: string,
    @Query('cliente_id') cliente_id?: string,
    @Query('maes') maes?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.formulas.findAll({
      q,
      categoria,
      origem,
      status,
      cliente_id,
      maes: maes === 'true' || maes === '1',
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.formulas.findOne(id);
  }

  @Get(':id/custo')
  custo(@Param('id', ParseIntPipe) id: number) {
    return this.formulas.calcularCusto(id);
  }

  @Get(':id/versoes')
  versoes(@Param('id', ParseIntPipe) id: number) {
    return this.formulas.versoes(id);
  }

  // --- escritas: pd e admin ---
  @Post()
  @Roles(Role.admin, Role.pd)
  create(@Body() dto: CreateFormulaDto, @CurrentUser() user: JwtUser) {
    return this.formulas.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.pd)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFormulaDto) {
    return this.formulas.update(id, dto);
  }

  @Post(':id/nova-versao')
  @Roles(Role.admin, Role.pd)
  novaVersao(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NovaVersaoDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.formulas.novaVersao(id, dto, user.sub);
  }

  @Post(':id/validar')
  @Roles(Role.admin, Role.pd)
  validar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ValidarFormulaDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.formulas.validar(id, dto, user.sub);
  }

  @Patch(':id/revisar-ncm')
  @Roles(Role.admin, Role.pd)
  revisarNcm(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevisarNcmDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.formulas.revisarNcm(id, dto, user.sub);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.pd)
  arquivar(@Param('id', ParseIntPipe) id: number) {
    return this.formulas.arquivar(id);
  }
}
