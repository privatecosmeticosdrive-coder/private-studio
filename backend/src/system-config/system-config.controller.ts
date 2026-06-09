import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SystemConfigService } from './system-config.service';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type JwtUser } from '../auth/decorators/current-user.decorator';

@Controller('system-config')
export class SystemConfigController {
  constructor(private readonly config: SystemConfigService) {}

  // leitura: qualquer autenticado (o app precisa dos parametros)
  @Get()
  get() {
    return this.config.get();
  }

  @Patch()
  @Roles(Role.admin)
  update(@Body() dto: UpdateSystemConfigDto, @CurrentUser() user: JwtUser) {
    return this.config.update(dto, user.sub);
  }
}
