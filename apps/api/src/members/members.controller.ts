import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createMemberSchema, updateMemberSchema, type CreateMemberInput, type UpdateMemberInput } from '@madre-pulse/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MembersService } from './members.service';

@UseGuards(JwtAuthGuard)
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  list() {
    return this.membersService.list();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post()
  create(@Body(new ZodValidationPipe(createMemberSchema)) dto: CreateMemberInput) {
    return this.membersService.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateMemberSchema)) dto: UpdateMemberInput) {
    return this.membersService.update(id, dto);
  }
}
