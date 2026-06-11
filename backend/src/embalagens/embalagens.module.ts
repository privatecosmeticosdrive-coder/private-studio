import { Module } from '@nestjs/common';
import { EmbalagensService } from './embalagens.service';
import { EmbalagensController } from './embalagens.controller';

@Module({
  controllers: [EmbalagensController],
  providers: [EmbalagensService],
  exports: [EmbalagensService],
})
export class EmbalagensModule {}
