import { Module } from '@nestjs/common';
import { OrcamentosService } from './orcamentos.service';
import { OrcamentosController } from './orcamentos.controller';
import { CalculoService } from './calculo.service';
import { FormatacaoService } from './formatacao.service';
import { PdfService } from './pdf.service';

@Module({
  controllers: [OrcamentosController],
  providers: [OrcamentosService, CalculoService, FormatacaoService, PdfService],
  exports: [OrcamentosService],
})
export class OrcamentosModule {}
