import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrcamentosService } from './orcamentos.service';
import { CreateOrcamentoDto } from './dto/create-orcamento.dto';
import { UpdateOrcamentoDto } from './dto/update-orcamento.dto';
import { CalcularDto } from './dto/calcular.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';

@Controller('orcamentos')
export class OrcamentosController {
  constructor(private readonly orcamentos: OrcamentosService) {}

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('cliente_id') cliente_id?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.orcamentos.findAll({
      status,
      cliente_id,
      q,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orcamentos.findOne(id);
  }

  // criar/editar: admin e comercial
  @Post()
  @Roles(Role.admin, Role.comercial)
  create(@Body() dto: CreateOrcamentoDto, @CurrentUser() user: JwtUser) {
    return this.orcamentos.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.comercial)
  update(@Param('id') id: string, @Body() dto: UpdateOrcamentoDto) {
    return this.orcamentos.update(id, dto);
  }

  @Post(':id/duplicar')
  @Roles(Role.admin, Role.comercial)
  duplicar(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.orcamentos.duplicar(id, user.sub);
  }

  // Fase 1 — cálculo único (trava JSON_CALC). admin, comercial, pd
  @Post(':id/calcular')
  @Roles(Role.admin, Role.comercial, Role.pd)
  calcular(
    @Param('id') id: string,
    @Body() dto: CalcularDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.orcamentos.calcular(id, dto, user.sub);
  }

  // Fase 2 — formatação das 4 páginas. admin, comercial, pd
  @Post(':id/formatar')
  @Roles(Role.admin, Role.comercial, Role.pd)
  formatar(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.orcamentos.formatar(id, user.sub);
  }
}
