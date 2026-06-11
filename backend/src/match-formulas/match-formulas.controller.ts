import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { MatchFormulasService } from './match-formulas.service';
import { MatchFormulasDto } from './dto/match-formulas.dto';
import { RefinarIaDto } from './dto/refinar-ia.dto';
import { Roles } from '../auth/decorators/roles.decorator';

// Montado sob /orcamentos (Doc 2d §C4). admin, comercial, pd.
@Controller('orcamentos')
export class MatchFormulasController {
  constructor(private readonly match: MatchFormulasService) {}

  // Match hibrido — custo zero (SQL + GIN).
  @Post('match-formulas')
  @HttpCode(200)
  @Roles(Role.admin, Role.comercial, Role.pd)
  matchFormulas(@Body() dto: MatchFormulasDto) {
    return this.match.match(dto);
  }

  // Refinar com IA — opcional, consome creditos (~R$0,15).
  @Post('match-formulas/refinar-ia')
  @HttpCode(200)
  @Roles(Role.admin, Role.comercial, Role.pd)
  refinarIa(@Body() dto: RefinarIaDto) {
    return this.match.refinarIa(dto.match_id);
  }
}
