import { Module } from '@nestjs/common';
import { AlertasService } from './alertas.service';
import { AlertasController } from './alertas.controller';

@Module({
  controllers: [AlertasController],
  providers: [AlertasService],
  exports: [AlertasService],
})
export class AlertasModule {}
