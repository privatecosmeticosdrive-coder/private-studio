import { Module } from '@nestjs/common';
import { AmostrasService } from './amostras.service';
import { AmostrasController } from './amostras.controller';
import { PipelineController } from './pipeline.controller';

@Module({
  controllers: [AmostrasController, PipelineController],
  providers: [AmostrasService],
  exports: [AmostrasService],
})
export class AmostrasModule {}
