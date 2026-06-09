import { Module } from '@nestjs/common';
import { MateriasPrimasService } from './materias-primas.service';
import { MateriasPrimasController } from './materias-primas.controller';
import { AlertasModule } from '../alertas/alertas.module';

@Module({
  imports: [AlertasModule], // usa AlertasService no atualizar-preco
  controllers: [MateriasPrimasController],
  providers: [MateriasPrimasService],
  exports: [MateriasPrimasService],
})
export class MateriasPrimasModule {}
