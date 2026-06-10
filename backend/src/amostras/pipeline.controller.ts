import { Controller, Get, Query } from '@nestjs/common';
import { AmostrasService } from './amostras.service';

// Kanban do pipeline — qualquer usuario autenticado (Doc 2c §3 decisao C)
@Controller('amostras')
export class PipelineController {
  constructor(private readonly amostras: AmostrasService) {}

  @Get('pipeline')
  pipeline(
    @Query('responsavel_id') responsavel_id?: string,
    @Query('cliente_id') cliente_id?: string,
  ) {
    return this.amostras.pipeline({ responsavel_id, cliente_id });
  }
}
