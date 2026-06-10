import { Module } from '@nestjs/common';
import { OrcamentosService } from './orcamentos.service';
import { OrcamentosController } from './orcamentos.controller';
import { CalculoService } from './calculo.service';
import { FormatacaoService } from './formatacao.service';

@Module({
  controllers: [OrcamentosController],
  providers: [OrcamentosService, CalculoService, FormatacaoService],
  exports: [OrcamentosService],
})
export class OrcamentosModule {}
