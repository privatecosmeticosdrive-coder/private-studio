import { Module } from '@nestjs/common';
import { MatchFormulasService } from './match-formulas.service';
import { MatchFormulasController } from './match-formulas.controller';

@Module({
  controllers: [MatchFormulasController],
  providers: [MatchFormulasService],
  exports: [MatchFormulasService],
})
export class MatchFormulasModule {}
