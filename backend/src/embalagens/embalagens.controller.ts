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
import { EmbalagensService } from './embalagens.service';
import { CreateEmbalagemDto } from './dto/create-embalagem.dto';
import { UpdateEmbalagemDto } from './dto/update-embalagem.dto';
import { AtualizarPrecoEmbDto } from './dto/atualizar-preco-emb.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';

@Controller('embalagens')
export class EmbalagensController {
  constructor(private readonly embalagens: EmbalagensService) {}

  // leitura: todos os usuarios autenticados (Doc 2d §B5)
  @Get()
  findAll(
    @Query('q') q?: string,
    @Query('tipo') tipo?: string,
    @Query('fornecedor') fornecedor?: string,
    @Query('material') material?: string,
    @Query('sem_cotacao') sem_cotacao?: string,
    @Query('ativo') ativo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.embalagens.findAll({
      q,
      tipo,
      fornecedor,
      material,
      sem_cotacao: sem_cotacao === 'true' || sem_cotacao === '1',
      ativo: ativo === undefined ? undefined : ativo === 'true' || ativo === '1',
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.embalagens.findById(id);
  }

  @Get(':id/historico')
  historico(@Param('id', ParseIntPipe) id: number) {
    return this.embalagens.historico(id);
  }

  @Get(':id/orcamentos')
  orcamentos(@Param('id', ParseIntPipe) id: number) {
    return this.embalagens.orcamentosQueUsam(id);
  }

  // cadastro/edicao: admin, compras, comercial (Doc 2d §B5)
  @Post()
  @Roles(Role.admin, Role.compras, Role.comercial)
  create(@Body() dto: CreateEmbalagemDto, @CurrentUser() user: JwtUser) {
    return this.embalagens.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.compras, Role.comercial)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmbalagemDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.embalagens.update(id, dto, user.sub);
  }

  @Post(':id/atualizar-preco')
  @Roles(Role.admin, Role.compras, Role.comercial)
  atualizarPreco(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AtualizarPrecoEmbDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.embalagens.atualizarPreco(id, dto, user.sub);
  }
}
