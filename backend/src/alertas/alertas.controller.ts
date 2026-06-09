import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { AlertasService } from './alertas.service';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';

// converte "true"/"false" da querystring em boolean (ou undefined)
function toBool(v?: string): boolean | undefined {
  if (v === undefined) return undefined;
  return v === 'true' || v === '1';
}

@Controller('alertas')
export class AlertasController {
  constructor(private readonly alertas: AlertasService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('lido') lido?: string,
    @Query('resolvido') resolvido?: string,
  ) {
    return this.alertas.findAll(user.sub, {
      lido: toBool(lido),
      resolvido: toBool(resolvido),
    });
  }

  @Patch(':id/marcar-lido')
  marcarLido(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.alertas.marcarLido(id, user.sub);
  }

  @Patch(':id/resolver')
  resolver(@Param('id', ParseIntPipe) id: number) {
    return this.alertas.resolver(id);
  }
}
