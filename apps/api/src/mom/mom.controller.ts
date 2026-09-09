import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  listMomCandidatesQuerySchema,
  updateMomAiSettingsSchema,
  updateMomCandidateSchema,
  type ListMomCandidatesQuery,
  type UpdateMomAiSettingsInput,
  type UpdateMomCandidateInput,
} from '@madre-pulse/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MomService } from './mom.service';

const MAX_MOM_PDF_BYTES = 20 * 1024 * 1024;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mom')
export class MomController {
  constructor(private readonly momService: MomService) {}

  @Roles('ADMIN')
  @Get('settings')
  getSettings() {
    return this.momService.getSettings();
  }

  @Roles('ADMIN')
  @Post('settings')
  updateSettings(@Body(new ZodValidationPipe(updateMomAiSettingsSchema)) dto: UpdateMomAiSettingsInput) {
    return this.momService.updateSettings(dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('uploads')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_MOM_PDF_BYTES },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Only PDF files are supported'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    return this.momService.upload(file);
  }

  @Roles('ADMIN')
  @Delete('uploads/:id')
  @HttpCode(204)
  removeUpload(@Param('id') id: string) {
    return this.momService.removeUpload(id);
  }

  // No @Roles() here — ADMIN/MANAGER see every org candidate, and any USER may see and act on
  // a candidate the AI matched to them specifically. Ownership is enforced in MomService.
  @Get('candidates')
  listCandidates(@Query(new ZodValidationPipe(listMomCandidatesQuerySchema)) query: ListMomCandidatesQuery) {
    return this.momService.listCandidates(query);
  }

  @Patch('candidates/:id')
  updateCandidate(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMomCandidateSchema)) dto: UpdateMomCandidateInput,
  ) {
    return this.momService.updateCandidate(id, dto);
  }

  @Post('candidates/:id/accept')
  accept(@Param('id') id: string) {
    return this.momService.acceptCandidate(id);
  }

  @Post('candidates/:id/reject')
  reject(@Param('id') id: string) {
    return this.momService.rejectCandidate(id);
  }
}
