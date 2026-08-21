import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createProjectSchema, updateProjectSchema, type CreateProjectInput, type UpdateProjectInput } from '@madre-pulse/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ProjectsService } from './projects.service';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list() {
    return this.projectsService.list();
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body(new ZodValidationPipe(createProjectSchema)) dto: CreateProjectInput) {
    return this.projectsService.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateProjectSchema)) dto: UpdateProjectInput) {
    return this.projectsService.update(id, dto);
  }
}
