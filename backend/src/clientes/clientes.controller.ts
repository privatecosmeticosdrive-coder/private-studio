import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  // leitura: qualquer usuario autenticado
  @Get()
  findAll(@Query('q') q?: string) {
    return this.clientes.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientes.findOne(id);
  }

  // escrita: admin e comercial
  @Post()
  @Roles(Role.admin, Role.comercial)
  create(@Body() dto: CreateClienteDto, @CurrentUser() user: JwtUser) {
    return this.clientes.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.comercial)
  update(@Param('id') id: string, @Body() dto: UpdateClienteDto) {
    return this.clientes.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.admin)
  remove(@Param('id') id: string) {
    return this.clientes.remove(id);
  }
}
