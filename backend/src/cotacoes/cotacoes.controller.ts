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
import { CotacoesService } from './cotacoes.service';
import { CreateCotacaoDto, RejeitarCotacaoDto } from './dto/cotacao.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';

@Controller('cotacoes')
export class CotacoesController {
  constructor(private readonly cotacoes: CotacoesService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.cotacoes.findAll(status);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cotacoes.findOne(id);
  }

  // criar cotacao formal: compras, admin
  @Post()
  @Roles(Role.admin, Role.compras)
  create(@Body() dto: CreateCotacaoDto, @CurrentUser() u: JwtUser) {
    return this.cotacoes.create(dto, u.sub);
  }

  @Patch(':id/validar-pd')
  @Roles(Role.admin, Role.pd)
  validarPd(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: JwtUser) {
    return this.cotacoes.validarPd(id, u.sub);
  }

  @Patch(':id/validar-compras')
  @Roles(Role.admin, Role.compras)
  validarCompras(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: JwtUser) {
    return this.cotacoes.validarCompras(id, u.sub);
  }

  @Patch(':id/rejeitar')
  @Roles(Role.admin, Role.compras, Role.pd)
  rejeitar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejeitarCotacaoDto,
    @CurrentUser() u: JwtUser,
  ) {
    return this.cotacoes.rejeitar(id, dto, u.sub);
  }

  // integra a cotacao validada ao banco (aplica preco na MP): compras, admin
  @Patch(':id/integrar')
  @Roles(Role.admin, Role.compras)
  integrar(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: JwtUser) {
    return this.cotacoes.integrar(id, u.sub);
  }
}
