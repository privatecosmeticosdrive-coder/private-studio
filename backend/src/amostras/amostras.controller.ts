import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AmostrasService } from './amostras.service';
import {
  AprovarClienteDto,
  FeedbackAmostraDto,
  ObsAmostraDto,
  RejeitarClienteDto,
  SolicitarAmostraDto,
} from './dto/amostra.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';

// Transicoes do pipeline + aprovacao do cliente, sob /api/orcamentos/:id/...
@Controller('orcamentos')
export class AmostrasController {
  constructor(private readonly amostras: AmostrasService) {}

  // aprovacao/rejeicao do cliente (passo separado da amostra — Doc 2c §6.2)
  @Post(':id/marcar-aprovado-cliente')
  @Roles(Role.admin, Role.comercial)
  aprovarCliente(@Param('id') id: string, @Body() dto: AprovarClienteDto, @CurrentUser() u: JwtUser) {
    return this.amostras.marcarAprovadoCliente(id, dto, u.sub);
  }

  @Post(':id/marcar-rejeitado-cliente')
  @Roles(Role.admin, Role.comercial)
  rejeitarCliente(@Param('id') id: string, @Body() dto: RejeitarClienteDto, @CurrentUser() u: JwtUser) {
    return this.amostras.marcarRejeitadoCliente(id, dto, u.sub);
  }

  // pipeline de amostragem
  @Post(':id/amostra/solicitar')
  @Roles(Role.admin, Role.comercial)
  solicitar(@Param('id') id: string, @Body() dto: SolicitarAmostraDto, @CurrentUser() u: JwtUser) {
    return this.amostras.solicitar(id, dto, u.sub);
  }

  @Post(':id/amostra/iniciar')
  @Roles(Role.admin, Role.pd)
  iniciar(@Param('id') id: string, @Body() dto: ObsAmostraDto, @CurrentUser() u: JwtUser) {
    return this.amostras.iniciar(id, dto, u.sub);
  }

  @Post(':id/amostra/pronta')
  @Roles(Role.admin, Role.pd)
  pronta(@Param('id') id: string, @Body() dto: ObsAmostraDto, @CurrentUser() u: JwtUser) {
    return this.amostras.pronta(id, dto, u.sub);
  }

  @Post(':id/amostra/enviar')
  @Roles(Role.admin, Role.comercial)
  enviar(@Param('id') id: string, @Body() dto: ObsAmostraDto, @CurrentUser() u: JwtUser) {
    return this.amostras.enviar(id, dto, u.sub);
  }

  @Post(':id/amostra/feedback')
  @Roles(Role.admin, Role.comercial)
  feedback(@Param('id') id: string, @Body() dto: FeedbackAmostraDto, @CurrentUser() u: JwtUser) {
    return this.amostras.feedback(id, dto, u.sub);
  }

  @Get(':id/amostra/eventos')
  eventos(@Param('id') id: string) {
    return this.amostras.eventos(id);
  }
}
