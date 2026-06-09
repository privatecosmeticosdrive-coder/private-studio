import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { MateriasPrimasService } from './materias-primas.service';
import { CreateMpDto } from './dto/create-mp.dto';
import { UpdateMpDto } from './dto/update-mp.dto';
import { AtualizarPrecoDto } from './dto/atualizar-preco.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';

@Controller('mps')
export class MateriasPrimasController {
  constructor(private readonly mps: MateriasPrimasService) {}

  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('fornecedor') fornecedor?: string,
    @Query('vencidas') vencidas?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.mps.findAll({
      q,
      fornecedor,
      vencidas: vencidas === 'true' || vencidas === '1',
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':codigo')
  findOne(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.mps.findByCodigo(codigo);
  }

  @Get(':codigo/formulas')
  formulas(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.mps.formulasQueUsam(codigo);
  }

  @Get(':codigo/historico')
  historico(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.mps.historico(codigo);
  }

  @Get(':codigo/historico/grafico')
  historicoGrafico(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.mps.historicoGrafico(codigo);
  }

  // cadastro/edicao: admin, compras, pd
  @Post()
  @Roles(Role.admin, Role.compras, Role.pd)
  create(@Body() dto: CreateMpDto) {
    return this.mps.create(dto);
  }

  @Patch(':codigo')
  @Roles(Role.admin, Role.compras, Role.pd)
  update(@Param('codigo', ParseIntPipe) codigo: number, @Body() dto: UpdateMpDto) {
    return this.mps.update(codigo, dto);
  }

  // Atualizacao Direta de preco: TODOS os usuarios autenticados (Doc 2b §B3)
  @Post(':codigo/atualizar-preco')
  atualizarPreco(
    @Param('codigo', ParseIntPipe) codigo: number,
    @Body() dto: AtualizarPrecoDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.mps.atualizarPreco(codigo, dto, user.sub);
  }
}
