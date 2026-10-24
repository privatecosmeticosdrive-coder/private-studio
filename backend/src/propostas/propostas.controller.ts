import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';
import { PropostasService } from './propostas.service';
import { AssinarPropostaDto, CancelarPropostaDto, CreatePropostaDto } from './dto/proposta.dto';

/** PROPOSTA COMERCIAL (10/26). Leitura: qualquer autenticado; escrita: admin e comercial. */
@Controller('propostas')
export class PropostasController {
  constructor(private readonly propostas: PropostasService) {}

  @Get('condicoes-padrao')
  condicoesPadrao() {
    return this.propostas.condicoesPadrao();
  }

  @Get()
  findAll(@Query('cliente_id') cliente_id?: string, @Query('status') status?: string) {
    return this.propostas.findAll({ cliente_id, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.propostas.findOne(id);
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.propostas.gerarPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  @Post()
  @Roles(Role.admin, Role.comercial)
  create(@Body() dto: CreatePropostaDto, @CurrentUser() user: JwtUser) {
    return this.propostas.create(dto, user);
  }

  // Aceite do cliente: libera amostragem (orçamentos enviados -> aprovado_cliente).
  @Post(':id/assinar')
  @Roles(Role.admin, Role.comercial)
  assinar(@Param('id') id: string, @Body() dto: AssinarPropostaDto, @CurrentUser() user: JwtUser) {
    return this.propostas.assinar(id, dto, user.sub);
  }

  @Post(':id/cancelar')
  @Roles(Role.admin, Role.comercial)
  cancelar(@Param('id') id: string, @Body() dto: CancelarPropostaDto, @CurrentUser() user: JwtUser) {
    return this.propostas.cancelar(id, dto?.motivo, user.sub);
  }
}
